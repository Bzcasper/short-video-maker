#!/usr/bin/env ts-node

/**
 * TTS Setup Test Script
 * Verifies that all TTS providers are properly configured
 */

import { getTTSConfigManager } from '../src/short-creator/libraries/TTSConfig';
import { TTSService } from '../src/short-creator/libraries/TTSService';

async function testTTSConfiguration() {
  console.log('🧪 Testing TTS Configuration...\n');

  // Test configuration manager
  const configManager = getTTSConfigManager();
  const config = configManager.getConfig();

  console.log('📋 Configuration Overview:');
  console.log(`Default Provider: ${config.defaultProvider}`);
  console.log(`Fallback Order: ${config.fallbackOrder.join(' → ')}`);
  console.log(`Monthly Budget: $${config.maxBudgetPerMonth}`);
  console.log(`Character Limit: ${config.characterLimitPerMonth.toLocaleString()}\n`);

  // Test enabled providers
  const enabledProviders = configManager.getEnabledProviders();
  console.log('✅ Enabled Providers:');
  enabledProviders.forEach(provider => {
    const providerConfig = configManager.getProviderConfig(provider)!;
    console.log(`  - ${provider}: ${providerConfig.enabled ? '✅' : '❌'} (Priority: ${providerConfig.priority})`);
    if (providerConfig.apiKey) {
      console.log(`    API Key: ${providerConfig.apiKey.substring(0, 8)}...${providerConfig.apiKey.substring(providerConfig.apiKey.length - 4)}`);
    } else {
      console.log(`    API Key: ❌ Missing`);
    }
  });

  console.log('\n');

  // Test cost estimation
  const testText = 'Hello world, this is a test of the TTS system.';
  console.log('💰 Cost Estimation:');
  console.log(`Text: "${testText}"`);
  console.log(`Characters: ${testText.length}`);

  enabledProviders.forEach(provider => {
    const cost = configManager.getCostEstimate(testText, provider);
    console.log(`  - ${provider}: $${cost.toFixed(6)} ($${(cost / testText.length * 1000).toFixed(4)} per 1k chars)`);
  });

  const minCost = configManager.getCostEstimate(testText);
  console.log(`  - Minimum cost: $${minCost.toFixed(6)}\n`);

  // Test TTS service initialization
  console.log('🚀 Testing TTS Service Initialization...');
  try {
    const ttsService = TTSService.getInstance();
    console.log('✅ TTS Service initialized successfully');

    // Test provider health
    const health = ttsService.getProviderHealth();
    console.log('\n🏥 Provider Health Status:');
    Object.entries(health).forEach(([provider, status]) => {
      console.log(`  - ${provider}: ${status.isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);
      if (status.lastError) {
        console.log(`    Last Error: ${status.lastError}`);
      }
      console.log(`    Success Rate: ${(status.successRate * 100).toFixed(1)}%`);
      console.log(`    Total Requests: ${status.totalRequests}`);
    });

  } catch (error) {
    console.error('❌ TTS Service initialization failed:', error);
    process.exit(1);
  }

  console.log('\n🎉 TTS Configuration Test Completed Successfully!');
  console.log('\nNext steps:');
  console.log('1. Add your API keys to .env file');
  console.log('2. Enable providers in TTSConfig.ts');
  console.log('3. Run actual TTS synthesis tests');
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: ts-node scripts/test-tts-setup.ts [options]

Options:
  --help, -h    Show this help message
  --verbose, -v Show detailed information

This script tests the TTS configuration and provider setup.
  `);
  process.exit(0);
}

// Run the test
testTTSConfiguration().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});