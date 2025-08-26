# Manual Northflank Deployment Guide

## 🚀 Step-by-Step Dashboard Deployment

### Prerequisites
- Northflank account created
- Docker image pushed: `bzcasper/content-gen:latest`
- API keys ready (Pexels, ElevenLabs, OpenAI, etc.)

---

## Step 1: Create Project
1. Go to [Northflank Dashboard](https://northflank.com)
2. Click **"New Project"**
3. Name: `short-video-maker`
4. Description: `AI-powered video creation platform`
5. Click **"Create Project"**

---

## Step 2: Deploy Redis Service
1. Click **"Create Service"** → **"Database"**
2. Select **Redis**
3. Configuration:
   - **Name**: `redis-service`
   - **Image**: `redis:7-alpine`
   - **CPU**: 0.5 vCPUs
   - **Memory**: 1 GB
   - **Storage**: 2 GB persistent storage
   - **Port**: 6379
4. Click **"Deploy Service"**

---

## Step 3: Create Secret Group
1. Go to **"Secrets"** in sidebar
2. Click **"Create Secret Group"**
3. Name: `short-video-maker-secrets`
4. Add these secrets (click **"Add Secret"** for each):

   ```
   PEXELS_API_KEY=your_pexels_api_key
   ELEVENLABS_API_KEY=your_elevenlabs_api_key
   OPENAI_API_KEY=your_openai_api_key
   AZURE_SPEECH_KEY=your_azure_speech_key
   AZURE_SPEECH_ENDPOINT=your_azure_endpoint
   AZURE_SPEECH_REGION=your_azure_region
   GOOGLE_TTS_API_KEY=your_google_api_key
   GOOGLE_CLOUD_PROJECT=your_google_project_id
   KOKORO_API_KEY=your_kokoro_api_key
   ```

5. Click **"Create Secret Group"**

---

## Step 4: Deploy Main Application
1. Click **"Create Service"** → **"Combined Service"**
2. Configuration:
   
   **Basic Settings:**
   - **Name**: `short-video-maker-cuda`
   - **Image**: `bzcasper/content-gen:latest`
   - **Port**: 8080
   
   **Resources:**
   - **CPU**: 2 vCPUs
   - **Memory**: 4 GB
   - **Storage**: 10 GB persistent storage at `/app/data`
   
   **Scaling:**
   - **Min Replicas**: 1
   - **Max Replicas**: 3
   - **Scale to Zero**: Disabled

3. Click **"Deploy Service"**

---

## Step 5: Configure Environment Variables
1. Go to your deployed service
2. Click **"Environment"** tab
3. Click **"Link Secret Group"**
4. Select: `short-video-maker-secrets`
5. Add these Environment Variables:

   ```bash
   # Application
   PORT=8080
   DATA_DIR_PATH=/app/data
   DOCKER=true
   CONCURRENCY=1
   VIDEO_CACHE_SIZE_IN_BYTES=2097152000
   LOG_LEVEL=info
   
   # TTS Configuration
   TTS_DEFAULT_PROVIDER=elevenlabs
   TTS_MAX_BUDGET=100
   TTS_MAX_CHARACTERS=1000000
   TTS_ENABLE_COST_OPTIMIZATION=true
   TTS_ENABLE_HEALTH_MONITORING=true
   TTS_MAX_REQUESTS_PER_MINUTE=60
   TTS_MAX_CONCURRENT_REQUESTS=5
   TTS_REQUEST_TIMEOUT_MS=30000
   TTS_RETRY_ATTEMPTS=3
   ENABLE_TTS_DEBUG=false
   
   # Redis Connection
   REDIS_HOST=redis-service
   REDIS_PORT=6379
   REDIS_DB=0
   
   # CUDA Settings (if GPU available)
   CUDA_VISIBLE_DEVICES=0
   NVIDIA_VISIBLE_DEVICES=all
   NVIDIA_DRIVER_CAPABILITIES=compute,utility,video
   ```

6. Click **"Save Changes"**

---

## Step 6: Configure Health Check
1. In service settings, go to **"Health Check"**
2. Configure:
   - **Path**: `/health`
   - **Port**: 8080
   - **Initial Delay**: 30s
   - **Timeout**: 30s
   - **Interval**: 60s

---

## Step 7: Configure Domain (Optional)
1. Go to **"Networking"** tab
2. Click **"Add Domain"**
3. Choose subdomain or custom domain
4. Enable HTTPS

---

## Step 8: Monitor Deployment
1. Go to **"Logs"** tab to monitor startup
2. Check **"Metrics"** for resource usage
3. Wait for status to show **"Running"**

---

## Step 9: Test Application
1. Access your application URL
2. Test video creation functionality
3. Check logs for any errors

---

## 🔧 Troubleshooting

### Common Issues:
1. **Build timeout**: Increase build timeout in service settings
2. **Memory issues**: Increase memory allocation
3. **Startup failures**: Check logs for missing environment variables
4. **Redis connection**: Verify Redis service is running

### Important Notes:
- Redis must be deployed and running before the main application
- All API keys must be properly configured in secrets
- The application needs time to download models on first startup
- Monitor logs during initial deployment

### Support Resources:
- [Northflank Documentation](https://northflank.com/docs)
- [Docker Image Documentation](../README.md)
- Application logs in Northflank dashboard

---

## 📊 Post-Deployment Checklist
- [ ] Redis service is running
- [ ] Main application is running  
- [ ] Health checks are passing
- [ ] All environment variables are set
- [ ] API keys are configured
- [ ] Application is accessible via URL
- [ ] Video creation functionality works
- [ ] Logs show no critical errors