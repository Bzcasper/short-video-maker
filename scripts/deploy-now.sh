#!/bin/bash

# Quick Deployment Script for Northflank
# Deploys the standard version first, then CUDA can be upgraded later

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Quick Northflank Deployment${NC}"

# Configuration
IMAGE_NAME="bzcasper/content-gen"
IMAGE_TAG="latest"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

# Check if Docker build is complete
if ! docker images | grep -q "$FULL_IMAGE"; then
    echo -e "${YELLOW}⏳ Waiting for Docker build to complete...${NC}"
    
    # Wait for build to complete (check every 30 seconds)
    while ! docker images | grep -q "$FULL_IMAGE"; do
        echo "Build still in progress..."
        sleep 30
    done
fi

echo -e "${GREEN}✅ Docker image ready${NC}"

# Push to registry
echo -e "${YELLOW}⬆️  Pushing to Docker registry...${NC}"
docker push $FULL_IMAGE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Image pushed successfully${NC}"
else
    echo -e "${RED}❌ Push failed${NC}"
    exit 1
fi

echo -e "${GREEN}🎉 Deployment ready!${NC}"
echo -e "${BLUE}Next steps:${NC}"
echo "1. Go to Northflank dashboard"
echo "2. Create new service with image: $FULL_IMAGE"
echo "3. Set environment variables from scripts/northflank-secrets.yaml"
echo "4. Deploy Redis service first"
echo "5. Monitor deployment logs"

echo ""
echo -e "${YELLOW}Manual deployment files:${NC}"
echo "- Redis: infrastructure/redis-service.yaml"
echo "- Main app: infrastructure/northflank-deployment.yaml"
echo "- Secrets template: scripts/northflank-secrets.yaml"
echo "- Full guide: scripts/northflank-deploy-guide.md"