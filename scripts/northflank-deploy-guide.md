# Northflank CUDA Deployment Guide

## Prerequisites

1. **Northflank Account**: Sign up at [northflank.com](https://northflank.com)
2. **Docker Hub Account**: For pushing images
3. **API Keys**: Required for TTS, video APIs, etc.

## Deployment Steps

### 1. Build and Push Docker Image

```bash
# Make deployment script executable
chmod +x scripts/deploy-northflank.sh

# Run the deployment script
./scripts/deploy-northflank.sh
```

Or manually:

```bash
# Build CUDA image
docker build -f main-cuda.Dockerfile -t thetoolpool/content-gen:latest-cuda .

# Push to registry
docker push thetoolpool/content-gen:latest-cuda
```

### 2. Deploy Redis Service

First deploy Redis as a dependency:

```bash
# Deploy Redis service
kubectl apply -f infrastructure/redis-service.yaml
```

Or create through Northflank UI:
- Service name: `redis-service`
- Image: `redis:7-alpine`
- Resources: 0.5 CPU, 1Gi memory
- Storage: 2Gi persistent volume

### 3. Set Up Secrets

Create the following secrets in Northflank:

```yaml
# Required API Keys
PEXELS_API_KEY: "your-pexels-api-key"
ELEVENLABS_API_KEY: "your-elevenlabs-api-key"
OPENAI_API_KEY: "your-openai-api-key"
AZURE_SPEECH_KEY: "your-azure-speech-key"
AZURE_SPEECH_ENDPOINT: "your-azure-endpoint"
AZURE_SPEECH_REGION: "eastus"
GOOGLE_TTS_API_KEY: "your-google-tts-key"
GOOGLE_CLOUD_PROJECT: "your-gcp-project-id"
KOKORO_API_KEY: "your-kokoro-key"
```

### 4. Deploy Main Application

Deploy the main CUDA application:

```bash
# Deploy main service
kubectl apply -f infrastructure/northflank-deployment.yaml
```

Or through Northflank UI:
- Service name: `short-video-maker-cuda`
- Image: `thetoolpool/content-gen:latest-cuda`
- Resources: 4 CPU, 8Gi memory, 1x NVIDIA A100 GPU
- Environment variables from secrets

### 5. Configure GPU Resources

Ensure your Northflank project has GPU quota:
- GPU Type: NVIDIA A100 (40GB recommended)
- Memory: 40Gi GPU memory
- Compute: 4+ CPUs, 8Gi+ RAM

### 6. Health Checks

The application exposes:
- Health endpoint: `GET /health`
- Port: 8080
- Ready after ~2-3 minutes (due to model loading)

### 7. Storage Configuration

Persistent storage requirements:
- Main data: 10Gi (models, cache, temp files)
- Redis data: 2Gi (for queues and caching)

## Environment Configuration

### Performance Tuning

Key environment variables for optimal performance:

```yaml
# CUDA Optimizations
CUDA_VISIBLE_DEVICES: "0"
PYTORCH_CUDA_ALLOC_CONF: "max_split_size_mb:512,garbage_collection_threshold:0.8"
FRAMEPACK_GPU_MEMORY_FRACTION: "0.85"
FRAMEPACK_USE_TENSORRT: "true"

# Whisper CUDA Settings
WHISPER_CUDA_BATCH_SIZE: "16"
WHISPER_CUDA_ENABLE_FLASH_ATTENTION: "1"

# Application Settings
CONCURRENCY: "1"
VIDEO_CACHE_SIZE_IN_BYTES: "2097152000"  # 2GB
```

### TTS Configuration

Configure your preferred TTS provider:

```yaml
TTS_DEFAULT_PROVIDER: "elevenlabs"  # or "kokoro", "azure", "google"
TTS_MAX_BUDGET: "100"
TTS_MAX_CHARACTERS: "1000000"
TTS_ENABLE_COST_OPTIMIZATION: "true"
```

## Monitoring and Scaling

### Auto-scaling

The deployment supports:
- Scale to zero: Yes (with proper health checks)
- Min replicas: 0
- Max replicas: 5
- CPU threshold: 70%
- Memory threshold: 80%

### Monitoring

Monitor the following metrics:
- GPU utilization
- Memory usage (system + GPU)
- Queue depth (Redis)
- Processing time per video
- Error rates

### Logs

Key log patterns to watch:
- `Redis connected successfully` - Redis is working
- `FFmpeg path set` - Video processing ready
- `Configuration initialized` - App startup complete
- CUDA initialization messages

## Troubleshooting

### Common Issues

1. **GPU Not Available**
   - Check GPU quota in Northflank
   - Verify CUDA drivers in container
   - Check NVIDIA_VISIBLE_DEVICES

2. **Redis Connection Failed**
   - Ensure Redis service is deployed first
   - Check service discovery names
   - Verify Redis health

3. **Model Loading Timeout**
   - Increase health check initial delay
   - Check persistent storage mounting
   - Monitor memory usage during startup

4. **TTS API Errors**
   - Verify API keys are set correctly
   - Check API quotas and limits
   - Review TTS provider configuration

### Health Check Commands

```bash
# Check application health
curl http://your-service/health

# Check Redis connectivity
kubectl exec -it redis-service -- redis-cli ping

# View application logs
kubectl logs -f deployment/short-video-maker-cuda

# Monitor GPU usage
kubectl exec -it short-video-maker-cuda -- nvidia-smi
```

## Cost Optimization

### GPU Usage

- Use scale-to-zero for development
- Consider spot instances for batch processing
- Monitor GPU utilization rates

### Storage

- Use appropriate storage classes
- Clean up old video cache regularly
- Compress models when possible

### API Costs

- Set TTS budgets appropriately
- Enable cost optimization features
- Monitor usage across providers

## Security Considerations

1. **Secrets Management**
   - Use Northflank secret management
   - Rotate API keys regularly
   - Limit secret access scope

2. **Network Security**
   - Configure proper ingress rules
   - Use internal service discovery
   - Enable TLS for external endpoints

3. **Container Security**
   - Regular image updates
   - Vulnerability scanning
   - Minimal privilege access

## Support and Documentation

- Northflank Documentation: https://northflank.com/docs
- GPU Instance Types: Check Northflank GPU offerings
- Support: Contact Northflank support for GPU quota increases

## Next Steps

After successful deployment:

1. Test video generation pipeline
2. Set up monitoring dashboards
3. Configure backup strategies
4. Implement CI/CD pipeline
5. Performance tune based on usage patterns