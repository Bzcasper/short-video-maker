#!/bin/bash

# Automated Northflank Deployment Script
# This script will deploy the Short Video Maker application to Northflank

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
IMAGE_NAME="bzcasper/content-gen:latest"
PROJECT_NAME="short-video-maker"
REDIS_SERVICE_NAME="redis-service"
APP_SERVICE_NAME="short-video-maker-cuda"

echo -e "${BLUE}🚀 Starting Northflank Deployment${NC}"
echo -e "${BLUE}====================================${NC}"

# Check if northflank CLI is installed
if ! command -v northflank &> /dev/null; then
    echo -e "${YELLOW}⚠️  Northflank CLI not found. Please install it first:${NC}"
    echo "npm install -g @northflank/cli"
    echo "Then login with: northflank login"
    exit 1
fi

# Check if user is logged in
if ! northflank projects list &> /dev/null; then
    echo -e "${RED}❌ Not logged in to Northflank${NC}"
    echo "Please login with: northflank login"
    exit 1
fi

echo -e "${GREEN}✅ Northflank CLI ready${NC}"

# Step 1: Create or verify project
echo -e "${YELLOW}📁 Setting up project...${NC}"
if northflank projects get --project="$PROJECT_NAME" &> /dev/null; then
    echo -e "${GREEN}✅ Project '$PROJECT_NAME' already exists${NC}"
else
    echo -e "${YELLOW}Creating new project: $PROJECT_NAME${NC}"
    northflank projects create \
        --name "$PROJECT_NAME" \
        --description "Short Video Maker - AI-powered video creation platform"
fi

# Step 2: Deploy Redis service
echo -e "${YELLOW}🔧 Deploying Redis service...${NC}"
if northflank services get --project="$PROJECT_NAME" --service="$REDIS_SERVICE_NAME" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Redis service already exists, updating...${NC}"
    northflank services update \
        --project="$PROJECT_NAME" \
        --service="$REDIS_SERVICE_NAME" \
        --image="redis:7-alpine" \
        --cpu=0.5 \
        --memory=1024 \
        --min-replicas=1 \
        --max-replicas=1
else
    echo -e "${YELLOW}Creating Redis service...${NC}"
    northflank services create \
        --project="$PROJECT_NAME" \
        --name="$REDIS_SERVICE_NAME" \
        --image="redis:7-alpine" \
        --cpu=0.5 \
        --memory=1024 \
        --min-replicas=1 \
        --max-replicas=1 \
        --port=6379
fi

echo -e "${GREEN}✅ Redis service deployed${NC}"

# Step 3: Create secrets (if they don't exist)
echo -e "${YELLOW}🔐 Setting up secrets...${NC}"
SECRET_GROUP="$PROJECT_NAME-secrets"

# Check if secret group exists
if ! northflank secret-groups get --project="$PROJECT_NAME" --secret-group="$SECRET_GROUP" &> /dev/null; then
    northflank secret-groups create \
        --project="$PROJECT_NAME" \
        --name="$SECRET_GROUP" \
        --description="API keys and secrets for Short Video Maker"
    
    echo -e "${YELLOW}⚠️  Please add your API keys to the secret group '$SECRET_GROUP' in the Northflank dashboard:${NC}"
    echo "   - PEXELS_API_KEY"
    echo "   - ELEVENLABS_API_KEY" 
    echo "   - OPENAI_API_KEY"
    echo "   - AZURE_SPEECH_KEY"
    echo "   - AZURE_SPEECH_ENDPOINT"
    echo "   - AZURE_SPEECH_REGION"
    echo "   - GOOGLE_TTS_API_KEY"
    echo "   - GOOGLE_CLOUD_PROJECT"
    echo "   - KOKORO_API_KEY"
    echo ""
    echo -e "${YELLOW}Press Enter when secrets are configured...${NC}"
    read -r
else
    echo -e "${GREEN}✅ Secret group already exists${NC}"
fi

# Step 4: Deploy main application
echo -e "${YELLOW}🚀 Deploying main application...${NC}"
if northflank services get --project="$PROJECT_NAME" --service="$APP_SERVICE_NAME" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Application service already exists, updating...${NC}"
    northflank services update \
        --project="$PROJECT_NAME" \
        --service="$APP_SERVICE_NAME" \
        --image="$IMAGE_NAME" \
        --cpu=2 \
        --memory=4096 \
        --min-replicas=1 \
        --max-replicas=3 \
        --port=8080
else
    echo -e "${YELLOW}Creating application service...${NC}"
    northflank services create \
        --project="$PROJECT_NAME" \
        --name="$APP_SERVICE_NAME" \
        --image="$IMAGE_NAME" \
        --cpu=2 \
        --memory=4096 \
        --min-replicas=1 \
        --max-replicas=3 \
        --port=8080 \
        --secret-group="$SECRET_GROUP"
fi

# Step 5: Configure environment variables
echo -e "${YELLOW}⚙️  Configuring environment variables...${NC}"
northflank services env set --project="$PROJECT_NAME" --service="$APP_SERVICE_NAME" \
    --env="TTS_DEFAULT_PROVIDER=elevenlabs" \
    --env="TTS_MAX_BUDGET=100" \
    --env="TTS_MAX_CHARACTERS=1000000" \
    --env="TTS_ENABLE_COST_OPTIMIZATION=true" \
    --env="PORT=8080" \
    --env="DATA_DIR_PATH=/app/data" \
    --env="DOCKER=true" \
    --env="CONCURRENCY=1" \
    --env="VIDEO_CACHE_SIZE_IN_BYTES=2097152000" \
    --env="REDIS_HOST=$REDIS_SERVICE_NAME" \
    --env="REDIS_PORT=6379" \
    --env="REDIS_DB=0" \
    --env="LOG_LEVEL=info"

echo -e "${GREEN}✅ Environment variables configured${NC}"

# Step 6: Wait for deployment
echo -e "${YELLOW}⏳ Waiting for services to be ready...${NC}"
sleep 30

# Step 7: Get service URLs
echo -e "${BLUE}🌐 Getting service information...${NC}"
APP_URL=$(northflank services get --project="$PROJECT_NAME" --service="$APP_SERVICE_NAME" --output=json | jq -r '.domains[0].domain' 2>/dev/null || echo "Not available yet")

echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo -e "${GREEN}========================${NC}"
echo ""
echo -e "${BLUE}📋 Service Information:${NC}"
echo "   Project: $PROJECT_NAME"
echo "   Redis Service: $REDIS_SERVICE_NAME"  
echo "   App Service: $APP_SERVICE_NAME"
echo "   Docker Image: $IMAGE_NAME"
echo ""
if [ "$APP_URL" != "Not available yet" ] && [ "$APP_URL" != "null" ]; then
    echo -e "${GREEN}🌐 Application URL: https://$APP_URL${NC}"
else
    echo -e "${YELLOW}🌐 Application URL: Check Northflank dashboard for URL${NC}"
fi
echo ""
echo -e "${BLUE}🔧 Next Steps:${NC}"
echo "1. Visit the Northflank dashboard to monitor deployment"
echo "2. Check logs if there are any issues"
echo "3. Test the application functionality"
echo "4. Set up custom domain if needed"
echo ""
echo -e "${BLUE}📊 Monitor deployment:${NC}"
echo "   northflank services logs --project=$PROJECT_NAME --service=$APP_SERVICE_NAME"
echo "   northflank services get --project=$PROJECT_NAME --service=$APP_SERVICE_NAME"