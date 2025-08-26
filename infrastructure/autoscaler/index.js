const express = require('express');
const Docker = require('dockerode');
const axios = require('axios');
const client = require('prom-client');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const scalingDecisions = new client.Counter({
  name: 'autoscaler_scaling_decisions_total',
  help: 'Total number of scaling decisions made',
  labelNames: ['action', 'service']
});

const scalingErrors = new client.Counter({
  name: 'autoscaler_errors_total',
  help: 'Total number of scaling errors',
  labelNames: ['type']
});

register.registerMetric(scalingDecisions);
register.registerMetric(scalingErrors);

// Configuration from environment variables
const config = {
  prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
  scalingEnabled: process.env.SCALING_ENABLED === 'true',
  minReplicas: parseInt(process.env.MIN_REPLICAS || '2'),
  maxReplicas: parseInt(process.env.MAX_REPLICAS || '20'),
  scaleUpThreshold: parseInt(process.env.SCALE_UP_THRESHOLD || '80'),
  scaleDownThreshold: parseInt(process.env.SCALE_DOWN_THRESHOLD || '20'),
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '30000') // 30 seconds
};

class AutoScaler {
  constructor() {
    this.services = {
      'api-gateway': { currentReplicas: 5 },
      'gpu-worker-cuda': { currentReplicas: 3 },
      'gpu-worker-cpu': { currentReplicas: 8 }
    };
  }

  async getPrometheusMetrics(query) {
    try {
      const response = await axios.get(`${config.prometheusUrl}/api/v1/query`, {
        params: { query }
      });
      return response.data.data.result;
    } catch (error) {
      console.error('Error fetching Prometheus metrics:', error.message);
      scalingErrors.inc({ type: 'prometheus_fetch' });
      return [];
    }
  }

  async getQueueDepth() {
    const results = await this.getPrometheusMetrics('redis_queue_length');
    return results.length > 0 ? parseFloat(results[0].value[1]) : 0;
  }

  async getCpuUsage(service) {
    const results = await this.getPrometheusMetrics(`rate(container_cpu_usage_seconds_total{container_label_com_docker_compose_service="${service}"}[1m]) * 100`);
    return results.length > 0 ? parseFloat(results[0].value[1]) : 0;
  }

  async getMemoryUsage(service) {
    const results = await this.getPrometheusMetrics(`container_memory_usage_bytes{container_label_com_docker_compose_service="${service}"} / container_spec_memory_limit_bytes{container_label_com_docker_compose_service="${service}"} * 100`);
    return results.length > 0 ? parseFloat(results[0].value[1]) : 0;
  }

  async evaluateScaling() {
    if (!config.scalingEnabled) {
      console.log('Auto-scaling is disabled');
      return;
    }

    const queueDepth = await this.getQueueDepth();
    console.log(`Current queue depth: ${queueDepth}`);

    for (const [service, info] of Object.entries(this.services)) {
      const cpuUsage = await this.getCpuUsage(service);
      const memoryUsage = await this.getMemoryUsage(service);

      console.log(`Service ${service}: CPU=${cpuUsage.toFixed(2)}%, Memory=${memoryUsage.toFixed(2)}%, Replicas=${info.currentReplicas}`);

      // Scale up logic
      if (queueDepth > 50 || cpuUsage > config.scaleUpThreshold || memoryUsage > config.scaleUpThreshold) {
        if (info.currentReplicas < config.maxReplicas) {
          await this.scaleService(service, 'up');
          scalingDecisions.inc({ action: 'up', service });
        }
      }
      // Scale down logic
      else if (queueDepth < 10 && cpuUsage < config.scaleDownThreshold && memoryUsage < config.scaleDownThreshold) {
        if (info.currentReplicas > config.minReplicas) {
          await this.scaleService(service, 'down');
          scalingDecisions.inc({ action: 'down', service });
        }
      }
    }
  }

  async scaleService(service, direction) {
    try {
      const containers = await docker.listContainers({
        filters: {
          label: [`com.docker.compose.service=${service}`]
        }
      });

      if (direction === 'up') {
        // Scale up by starting a new container
        const serviceConfig = await this.getServiceConfig(service);
        if (serviceConfig) {
          await docker.createContainer(serviceConfig);
          this.services[service].currentReplicas++;
          console.log(`Scaled up ${service} to ${this.services[service].currentReplicas} replicas`);
        }
      } else if (direction === 'down' && containers.length > 0) {
        // Scale down by stopping a container
        const container = docker.getContainer(containers[0].Id);
        await container.stop();
        await container.remove();
        this.services[service].currentReplicas--;
        console.log(`Scaled down ${service} to ${this.services[service].currentReplicas} replicas`);
      }
    } catch (error) {
      console.error(`Error scaling ${service}:`, error.message);
      scalingErrors.inc({ type: 'scale_error' });
    }
  }

  async getServiceConfig(serviceName) {
    // This would need to be implemented to get the service configuration
    // from Docker Compose or a configuration file
    return null;
  }

  start() {
    setInterval(() => this.evaluateScaling(), config.checkInterval);
    console.log('Auto-scaler started with configuration:', config);
  }
}

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const autoscaler = new AutoScaler();
autoscaler.start();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Auto-scaler listening on port ${PORT}`);
});

module.exports = app;