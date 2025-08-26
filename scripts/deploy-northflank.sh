#!/bin/bash

# Northflank CUDA Deployment Script
# This script builds and deploys the short video maker with CUDA support to Northflank

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Northflank CUDA deployment...${NC}"

# Configuration
IMAGE_NAME="thetoolpool/content-gen"
IMAGE_TAG="latest-cuda"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
DEPLOYMENT_CONFIG="infrastructure/northflank-deployment.yaml"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Build Docker image
echo -e "${YELLOW}📦 Building CUDA Docker image...${NC}"
docker build -f main-cuda.Dockerfile -t $FULL_IMAGE . --progress=plain

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
else
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

# Push Docker image
echo -e "${YELLOW}⬆️  Pushing Docker image to registry...${NC}"
docker push $FULL_IMAGE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker image pushed successfully${NC}"
else
    echo -e "${RED}❌ Docker push failed${NC}"
    exit 1
fi

# Deploy to Northflank
echo -e "${YELLOW}🚢 Deploying to Northflank...${NC}"

# Check if Northflank CLI is installed
if ! command -v northflank &> /dev/null; then
    echo -e "${YELLOW}⚠️  Northflank CLI not found. Please install it or deploy manually using the web interface.${NC}"
    echo -e "${BLUE}📋 Manual deployment steps:${NC}"
    echo "1. Log into Northflank web interface"
    echo "2. Create a new service"
    echo "3. Use Docker image: $FULL_IMAGE"
    echo "4. Copy configuration from: $DEPLOYMENT_CONFIG"
    echo "5. Set required environment variables"
else
    # Deploy using CLI
    northflank deploy --config $DEPLOYMENT_CONFIG
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Deployment successful${NC}"
    else
        echo -e "${RED}❌ Deployment failed${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}🎉 Deployment completed!${NC}"
echo -e "${BLUE}📊 Next steps:${NC}"
echo "1. Set up environment variables in Northflank dashboard"
echo "2. Configure GPU resources (A100 recommended)"
echo "3. Monitor deployment logs"
echo "4. Test health endpoint: /health"

# Check deployment status
echo -e "${YELLOW}📊 Checking deployment status...${NC}"
if command -v northflank &> /dev/null; then
    northflank get services --format table
fi