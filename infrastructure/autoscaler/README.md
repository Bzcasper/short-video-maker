# Auto-scaler Service

A Docker-based auto-scaling service for the Short Video Maker platform that monitors system metrics and automatically scales worker pools based on load.

## Features

- **Real-time Monitoring**: Collects metrics from Prometheus (CPU, memory, queue depth)
- **Intelligent Scaling**: Scales services up/down based on configurable thresholds
- **Multiple Services**: Supports scaling for API gateway, GPU workers, and CPU workers
- **Prometheus Metrics**: Exposes scaling metrics for monitoring
- **Health Checks**: Provides health endpoints for container orchestration

## Configuration

Environment variables:

- `PROMETHEUS_URL`: Prometheus server URL (default: http://prometheus:9090)
- `SCALING_ENABLED`: Enable/disable auto-scaling (default: true)
- `MIN_REPLICAS`: Minimum number of replicas per service (default: 2)
- `MAX_REPLICAS`: Maximum number of replicas per service (default: 20)
- `SCALE_UP_THRESHOLD`: CPU/Memory usage threshold for scaling up (default: 80%)
- `SCALE_DOWN_THRESHOLD`: CPU/Memory usage threshold for scaling down (default: 20%)
- `CHECK_INTERVAL`: How often to check metrics (default: 30000ms)

## Supported Services

- `api-gateway`: API gateway service
- `gpu-worker-cuda`: GPU workers with CUDA support
- `gpu-worker-cpu`: CPU-based workers

## Building

```bash
docker build -t short-video-autoscaler .
```

## Running

```bash
docker run -d \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e PROMETHEUS_URL=http://prometheus:9090 \
  -e SCALING_ENABLED=true \
  short-video-autoscaler
```

## API Endpoints

- `GET /health`: Health check endpoint
- `GET /metrics`: Prometheus metrics endpoint

## Metrics

The service exposes the following Prometheus metrics:

- `autoscaler_scaling_decisions_total`: Total scaling decisions made
- `autoscaler_errors_total`: Total scaling errors encountered