#!/bin/bash

set -e

echo "🚀 TA Demo API Deployment Script"
echo "=================================="

# Check if multitenant-network exists, create if it doesn't
if ! docker network inspect multitenant-network >/dev/null 2>&1; then
    echo "📡 Creating multitenant-network..."
    docker network create multitenant-network
    echo "✅ Network created successfully!"
else
    echo "✅ multitenant-network already exists"
fi

# Build and deploy
echo "🔨 Building Docker image..."
docker-compose build

echo "🚀 Starting TA Demo API..."
docker-compose up -d

echo "⏳ Waiting for application to be ready..."
sleep 5

# Check if container is running
if docker ps | grep -q ta-demo-api; then
    echo "✅ TA Demo API is running!"
    echo ""
    echo "📊 Container status:"
    docker ps | grep ta-demo-api
    echo ""
    echo "📝 To view logs:"
    echo "   docker logs -f ta-demo-api"
    echo ""
    echo "🌐 API should be available at:"
    echo "   http://localhost:3000"
    echo "   Dashboard: http://localhost:3000/dashboard"
    echo ""
    echo "🛠  To run database seed:"
    echo "   docker exec ta-demo-api npx prisma db seed"
else
    echo "❌ Failed to start TA Demo API"
    echo "📝 Check logs with: docker logs ta-demo-api"
    exit 1
fi
