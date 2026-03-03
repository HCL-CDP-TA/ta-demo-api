#!/bin/bash

# TA Demo API Docker Deployment Script
# Usage: ./deploy.sh [version] [environment] [--local]
# Example: ./deploy.sh v1.0.0 production
# Example: ./deploy.sh main development
# Example: ./deploy.sh local development --local (uses current directory)

set -e

# Configuration
REPO_URL="https://github.com/HCL-CDP-TA/ta-demo-api.git"
APP_NAME="ta-demo-api"
CONTAINER_NAME="${APP_NAME}"
IMAGE_NAME="${APP_NAME}"
BUILD_CONTEXT="/tmp/${APP_NAME}-build"
DEFAULT_VERSION="main"
DEFAULT_ENV="production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
VERSION=${1:-$DEFAULT_VERSION}
ENVIRONMENT=${2:-$DEFAULT_ENV}
LOCAL_MODE=false

for arg in "$@"; do
    if [ "$arg" = "--local" ]; then
        LOCAL_MODE=true
        break
    fi
done

if [ "$VERSION" = "local" ]; then
    LOCAL_MODE=true
    VERSION="local-$(date +%Y%m%d-%H%M%S)"
fi

log_info "Starting deployment of ${APP_NAME}"
log_info "Version: ${VERSION}"
log_info "Environment: ${ENVIRONMENT}"
log_info "Local mode: ${LOCAL_MODE}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Ensure multitenant-network exists
if ! docker network inspect multitenant-network >/dev/null 2>&1; then
    log_info "Creating multitenant-network..."
    docker network create multitenant-network
    log_success "Network created successfully"
else
    log_info "multitenant-network already exists"
fi

# Function to cleanup build context
cleanup() {
    if [ "$LOCAL_MODE" = false ] && [ -d "$BUILD_CONTEXT" ]; then
        log_info "Cleaning up build context..."
        rm -rf "$BUILD_CONTEXT"
    fi
}

trap cleanup EXIT

# Load environment variables from .env.local or .env
# Uses a temp file with quotes stripped to avoid bash parsing issues
load_env_file() {
    local env_file="$1"
    local tmp_env
    tmp_env=$(mktemp)
    # Normalize all values: strip comments/empty lines, remove existing quotes, then re-quote all values
    grep -v '^\s*#' "$env_file" | grep -v '^\s*$' | while IFS='=' read -r key value; do
        # Strip surrounding quotes from value
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"
        echo "${key}=\"${value}\""
    done > "$tmp_env"
    set -a
    source "$tmp_env"
    set +a
    rm -f "$tmp_env"
}

if [ -f ".env.local" ]; then
    log_info "Loading environment variables from .env.local"
    load_env_file ".env.local"
elif [ -f ".env" ]; then
    log_info "Loading environment variables from .env"
    load_env_file ".env"
else
    log_warning "No .env or .env.local file found, using default environment variables"
fi

# Stop and remove existing container if running
log_info "Checking for existing container: $CONTAINER_NAME"
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    log_info "Stopping existing container: $CONTAINER_NAME"
    docker stop "$CONTAINER_NAME" || log_warning "Failed to stop container gracefully"
else
    log_info "No running container found with name: $CONTAINER_NAME"
fi

if docker ps -aq -f name="$CONTAINER_NAME" | grep -q .; then
    log_info "Removing existing container: $CONTAINER_NAME"
    docker rm "$CONTAINER_NAME" || log_warning "Failed to remove container"
else
    log_info "No existing container found to remove"
fi

# Remove existing image to force rebuild
if docker images -q "$IMAGE_NAME" | grep -q .; then
    log_info "Removing existing image: $IMAGE_NAME"
    docker rmi "$IMAGE_NAME" || true
fi

# Prepare build context based on mode
if [ "$LOCAL_MODE" = true ]; then
    log_info "Using local directory for build..."
    BUILD_CONTEXT="$(pwd)"

    if [ ! -f "$BUILD_CONTEXT/Dockerfile" ]; then
        log_error "Dockerfile not found in current directory: $BUILD_CONTEXT"
        exit 1
    fi

    if git rev-parse --git-dir > /dev/null 2>&1; then
        COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    else
        COMMIT_HASH="local"
    fi
else
    log_info "Preparing build context..."
    mkdir -p "$BUILD_CONTEXT"
    cd "$BUILD_CONTEXT"

    log_info "Cloning repository from $REPO_URL"
    git clone "$REPO_URL" .

    log_info "Fetching tags..."
    git fetch --tags

    if [ -f "$OLDPWD/.env.local" ]; then
        log_info "Copying .env.local into build context..."
        cp "$OLDPWD/.env.local" .
    elif [ -f "$OLDPWD/.env" ]; then
        log_info "Copying .env into build context..."
        cp "$OLDPWD/.env" .
    else
        log_warning "No .env or .env.local file found in deployment directory"
    fi

    log_info "Checking out version: $VERSION"
    git checkout "$VERSION"

    COMMIT_HASH=$(git rev-parse --short HEAD)
fi

IMAGE_TAG="${VERSION}-${COMMIT_HASH}"

log_info "Building Docker image: ${IMAGE_NAME}:${IMAGE_TAG}"

# Build with GitHub token secret for private dependencies
DOCKER_SECRET_ARGS=()
if [ -n "${GITHUB_TOKEN:-}" ]; then
    log_info "Using GITHUB_TOKEN for private dependency access"
    DOCKER_SECRET_ARGS+=(--secret "id=github_token,env=GITHUB_TOKEN")
else
    log_warning "GITHUB_TOKEN not set - private GitHub dependencies may fail to install"
fi

docker build \
    "${DOCKER_SECRET_ARGS[@]}" \
    --build-arg NODE_ENV="$ENVIRONMENT" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg VCS_REF="$COMMIT_HASH" \
    --build-arg VERSION="$VERSION" \
    -t "${IMAGE_NAME}:${IMAGE_TAG}" \
    -t "${IMAGE_NAME}:latest" \
    "$BUILD_CONTEXT"

log_success "Docker image built successfully"

PORT=3300

log_info "Starting new container on port $PORT"

docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --network multitenant-network \
    -p "$PORT:3300" \
    -e NODE_ENV="${NODE_ENV:-production}" \
    -e PORT=3300 \
    -e DATABASE_URL="${DATABASE_URL}" \
    -e PHONE_EMULATOR_URL="${PHONE_EMULATOR_URL:-http://host.docker.internal:3001}" \
    -e API_BASE_URL="${API_BASE_URL:-}" \
    -e TA_DEMO_API_URL="${TA_DEMO_API_URL:-}" \
    -e CDP_ENDPOINT="${CDP_ENDPOINT:-https://crux.dev.hxcd.now.hclsoftware.cloud}" \
    -e CDP_API_KEY="${CDP_API_KEY:-}" \
    -e CDP_PASS_KEY="${CDP_PASS_KEY:-}" \
    -e WEBHOOK_API_KEY="${WEBHOOK_API_KEY:-demo-webhook-secret-2025}" \
    -e COMMERCE_HOST_URL="${COMMERCE_HOST_URL:-}" \
    -e COMMERCE_STORE_HOST="${COMMERCE_STORE_HOST:-}" \
    -e COMMERCE_TRANSACTION_CONTEXT="${COMMERCE_TRANSACTION_CONTEXT:-/wcs/resources}" \
    -e COMMERCE_SEARCH_CONTEXT="${COMMERCE_SEARCH_CONTEXT:-/search/resources}" \
    -e COMMERCE_STORE_ID="${COMMERCE_STORE_ID:-41}" \
    -e COMMERCE_CATALOG_ID="${COMMERCE_CATALOG_ID:-11501}" \
    -e COMMERCE_CONTRACT_ID="${COMMERCE_CONTRACT_ID:--41005}" \
    -e COMMERCE_VERSION="${COMMERCE_VERSION:-commerce-9x}" \
    -e COMMERCE_STORE_NAME="${COMMERCE_STORE_NAME:-Ruby}" \
    -e COMMERCE_FULFILLMENT_CENTER="${COMMERCE_FULFILLMENT_CENTER:-R00B2C}" \
    -e COMMERCE_ADMIN_USER="${COMMERCE_ADMIN_USER:-}" \
    -e COMMERCE_ADMIN_PASSWORD="${COMMERCE_ADMIN_PASSWORD:-}" \
    -e COB_TIME="${COB_TIME:-17:00}" \
    -e DEFAULT_SHOPPING_CENTRE="${DEFAULT_SHOPPING_CENTRE:-Westfield Mall}" \
    -e DEFAULT_STORE="${DEFAULT_STORE:-Zara}" \
    -e ENABLE_CDP_TRACKING="${ENABLE_CDP_TRACKING:-true}" \
    -e ENABLE_WHATSAPP="${ENABLE_WHATSAPP:-true}" \
    -e ENABLE_SSE="${ENABLE_SSE:-true}" \
    -e LOG_LEVEL="${LOG_LEVEL:-info}" \
    --label "app=$APP_NAME" \
    --label "environment=$ENVIRONMENT" \
    --label "version=$VERSION" \
    --label "commit=$COMMIT_HASH" \
    "${IMAGE_NAME}:${IMAGE_TAG}"

# Wait for container to be ready
log_info "Waiting for application to start..."
sleep 5

# Health check
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -f "http://localhost:$PORT" > /dev/null 2>&1; then
        log_success "Application is healthy and running on port $PORT"
        break
    else
        log_info "Waiting for application to be ready... (attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
        sleep 2
        RETRY_COUNT=$((RETRY_COUNT + 1))
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_error "Application failed to start properly"
    log_info "Container logs:"
    docker logs "$CONTAINER_NAME"
    exit 1
fi

log_success "Deployment completed successfully!"
echo
echo "=== Deployment Summary ==="
echo "Application: $APP_NAME"
echo "Version: $VERSION"
echo "Environment: $ENVIRONMENT"
echo "Commit: $COMMIT_HASH"
echo "Port: $PORT"
echo "Container: $CONTAINER_NAME"
echo "Image: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "URL: http://localhost:$PORT"
echo
echo "=== Useful Commands ==="
echo "View logs: docker logs -f $CONTAINER_NAME"
echo "Stop container: docker stop $CONTAINER_NAME"
echo "Restart container: docker restart $CONTAINER_NAME"
echo "Remove container: docker rm -f $CONTAINER_NAME"
echo "Database seed: docker exec $CONTAINER_NAME npx prisma db seed"
echo
log_success "TA Demo API is now running at http://localhost:$PORT"
