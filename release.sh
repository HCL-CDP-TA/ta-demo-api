#!/bin/bash

# GitHub Release Script
# Merges a PR, deletes its branch, and checks for release-please automation
#
# Usage: ./release.sh [pr-number]
# Example: ./release.sh 42
# If no PR number provided, uses current branch's PR or shows list to choose from

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    log_error "GitHub CLI (gh) is not installed."
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    log_error "Not authenticated with GitHub CLI."
    echo "Run: gh auth login"
    exit 1
fi

PR_NUMBER=$1

# If no PR number provided, try to detect from current branch or show list
if [ -z "$PR_NUMBER" ]; then
    log_info "No PR number provided, detecting from current branch..."
    
    # Get current branch name
    CURRENT_BRANCH=$(git branch --show-current)
    
    if [ "$CURRENT_BRANCH" = "main" ]; then
        log_info "On main branch. Here are the open PRs:"
        echo ""
        
        # Get list of PRs with details
        PR_LIST=$(gh pr list --json number,title,headRefName,updatedAt --jq '.[] | "\(.number)|\(.title)|\(.headRefName)|\(.updatedAt)"' 2>/dev/null)
        
        if [ -z "$PR_LIST" ]; then
            log_error "No open PRs found."
            exit 1
        fi
        
        # Display PRs in a nice format
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        printf "%-6s %-50s %s\n" "PR #" "Title" "Branch"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        echo "$PR_LIST" | while IFS='|' read -r number title branch updated; do
            printf "%-6s %-50s %s\n" "#$number" "${title:0:47}..." "$branch"
        done
        
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        # Prompt for PR number
        read -p "Enter PR number to merge: " PR_NUMBER
        
        if [ -z "$PR_NUMBER" ]; then
            log_error "No PR number provided."
            exit 1
        fi
    else
        # Try to find PR for current branch
        PR_NUMBER=$(gh pr list --head "$CURRENT_BRANCH" --json number --jq '.[0].number' 2>/dev/null)
        
        if [ -z "$PR_NUMBER" ] || [ "$PR_NUMBER" = "null" ]; then
            log_error "No open PR found for branch: $CURRENT_BRANCH"
            log_info "Available PRs:"
            gh pr list
            exit 1
        fi
        
        log_info "Found PR #${PR_NUMBER} for branch: $CURRENT_BRANCH"
    fi
fi

# Get PR details
log_info "Fetching PR #${PR_NUMBER} details..."
PR_TITLE=$(gh pr view "$PR_NUMBER" --json title --jq '.title' 2>/dev/null)

if [ -z "$PR_TITLE" ]; then
    log_error "PR #${PR_NUMBER} not found."
    log_info "Available PRs:"
    gh pr list
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PR #${PR_NUMBER}: ${PR_TITLE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check PR status
PR_STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state')
PR_MERGEABLE=$(gh pr view "$PR_NUMBER" --json mergeable --jq '.mergeable')

if [ "$PR_STATE" != "OPEN" ]; then
    log_error "PR #${PR_NUMBER} is not open (state: $PR_STATE)"
    exit 1
fi

if [ "$PR_MERGEABLE" = "CONFLICTING" ]; then
    log_error "PR #${PR_NUMBER} has merge conflicts. Please resolve them first."
    exit 1
fi

# Check if checks are passing
CHECKS_STATUS=$(gh pr view "$PR_NUMBER" --json statusCheckRollup --jq '.statusCheckRollup[].conclusion' 2>/dev/null | grep -v "SUCCESS" | grep -v "SKIPPED" | grep -v "NEUTRAL" | wc -l)

if [ "$CHECKS_STATUS" -gt 0 ]; then
    log_warning "Some checks are not passing for PR #${PR_NUMBER}"
    gh pr checks "$PR_NUMBER"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Release cancelled."
        exit 0
    fi
fi

# Confirm merge
echo ""
read -p "Merge PR #${PR_NUMBER} and delete branch? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Release cancelled."
    exit 0
fi

# Merge and delete branch
log_info "Merging PR #${PR_NUMBER}..."
if gh pr merge "$PR_NUMBER" --merge --delete-branch; then
    log_success "PR #${PR_NUMBER} merged and branch deleted!"
else
    log_error "Failed to merge PR #${PR_NUMBER}"
    exit 1
fi

# Switch to main and pull
log_info "Switching to main branch..."
git checkout main

log_info "Pulling latest changes..."
git pull

# Show latest commit
log_success "Release complete!"
echo ""
echo "Latest commit on main:"
git log -1 --oneline

# Show release-please status if workflow exists
if [ -f ".github/workflows/release-please.yml" ]; then
    echo ""
    log_info "Waiting for release-please to create release PR..."
    sleep 3
    
    # Check for release PR
    RELEASE_PR=$(gh pr list --label "autorelease: pending" --json number,title --jq '.[0] | "\(.number): \(.title)"' 2>/dev/null)
    
    if [ -n "$RELEASE_PR" ] && [ "$RELEASE_PR" != "null: " ]; then
        log_success "Release PR created: #${RELEASE_PR}"
        echo "View it with: gh pr view $(echo $RELEASE_PR | cut -d: -f1)"
    else
        log_info "No release PR yet. Check GitHub Actions: gh run list"
    fi
fi

echo ""
log_success "All done! 🎉"
