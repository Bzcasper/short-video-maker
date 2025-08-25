#!/usr/bin/env ts-node

/**
 * TTS Provider Setup Script
 * Interactive script to help configure TTS providers with API keys
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface ProviderConfig {
  name: string;
  apiKey: string;
  endpoint?: string;
  region?: string;
  projectId?: string;
  enabled: boolean;
}

class TTSSetup {
  private rl: readline.Interface;
  private envPath: string;
  private configPath: string;
  private providers: Record<string, ProviderConfig>;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    this.envPath = path.join(process.cwd(), '.env');
    this.configPath = path.join(process.cwd(), 'src', 'short-creator', 'libraries', 'TTSConfig.ts');
    this.providers = {};
  }

  private question(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(query, resolve);
    });
  }

  private async confirm(message: string): Promise<boolean> {
    const answer = await this.question(`${message} (y/N): `);
    return answer.toLowerCase() === 'y';
  }

  private async setupElevenLabs(): Promise<void> {
    console.log('\n🎤 ElevenLabs Setup');
    console.log('==================');
    console.log('1. Sign up at https://elevenlabs.io/');
    console.log('2. Go to Profile → API Keys');
    console.log('3. Generate a new API key');
    
    const apiKey = await this.question('Enter your ElevenLabs API key: ');
    const enabled = await confirm('Enable ElevenLabs provider?');

    this.providers.elevenlabs = {
      name: 'elevenlabs',
      apiKey: apiKey.trim(),
      enabled
    };
  }

  private async setupOpenAI(): Promise<void> {
    console.log('\n🤖 OpenAI Setup');
    console.log('===============');
    console.log('1. Sign up at https://platform.openai.com/');
    console.log('2. Go to API Keys section');
    console.log('3. Generate a new API key');
    
    const apiKey = await this.question('Enter your OpenAI API key: ');
    const enabled = await confirm('Enable OpenAI provider?');

    this.providers.openai = {
      name: 'openai',
      apiKey: apiKey.trim(),
      enabled
    };
  }

  private async setupAzure(): Promise<void> {
    console.log('\n☁️ Azure Speech Services Setup');
    console.log('============================');
    console.log('1. Create Azure account at https://portal.azure.com/');
    console.log('2. Create a Speech Services resource');
    console.log('3. Get API key and endpoint from resource overview');
    
    const apiKey = await this.question('Enter your Azure Speech key: ');
    const endpoint = await this.question('Enter your Azure Speech endpoint: ');
    const region = await this.question('Enter your Azure region (e.g., eastus): ');
    const enabled = await confirm('Enable Azure provider?');

    this.providers.azure = {
      name: 'azure',
      apiKey: apiKey.trim(),
      endpoint: endpoint.trim(),
      region: region.trim(),
      enabled
    };
  }

  private async setupGoogle(): Promise<void> {
    console.log('\n🌐 Google Cloud TTS Setup');
    console.log('========================');
    console.log('1. Create Google Cloud account at https://console.cloud.google.com/');
    console.log('2. Enable Text-to-Speech API');
    console.log('3. Create API credentials');
    
    const apiKey = await this.question('Enter your Google TTS API key: ');
    const projectId = await this.question('Enter your Google Cloud project ID: ');
    const enabled = await confirm('Enable Google provider?');

    this.providers.google = {
      name: 'google',
      apiKey: apiKey.trim(),
      projectId: projectId.trim(),
      enabled
    };
  }

  private async setupKokoro(): Promise<void> {
    console.log('\n🔊 Kokoro TTS Setup');
    console.log('==================');
    console.log('Kokoro is the existing provider with basic setup');
    
    const apiKey = await this.question('Enter your Kokoro API key (optional, press Enter to skip): ');
    const enabled = await confirm('Enable Kokoro provider?');

    this.providers.kokoro = {
      name: 'kokoro',
      apiKey: apiKey.trim() || 'your_kokoro_api_key_here',
      endpoint: 'https://api.kokoro.io/v1',
      enabled
    };
  }

  private async updateEnvFile(): Promise<void> {
    let envContent = fs.readFileSync(this.envPath, 'utf8');

    // Update provider API keys
    for (const [provider, config] of Object.entries(this.providers)) {
      const providerUpper = provider.toUpperCase();
      
      // Update API key
      const apiKeyRegex = new RegExp(`^${providerUpper}_API_KEY=.*`, 'm');
      if (apiKeyRegex.test(envContent)) {
        envContent = envContent.replace(apiKeyRegex, `${providerUpper}_API_KEY=${config.apiKey}`);
      } else {
        envContent += `\n${providerUpper}_API_KEY=${config.apiKey}`;
      }

      // Update enable flag
      const enableRegex = new RegExp(`^ENABLE_${providerUpper}=.*`, 'm');
      const enableValue = config.enabled ? 'true' : 'false';
      if (enableRegex.test(envContent)) {
        envContent = envContent.replace(enableRegex, `ENABLE_${providerUpper}=${enableValue}`);
      } else {
        envContent += `\nENABLE_${providerUpper}=${enableValue}`;
      }

      // Update provider-specific settings
      if (provider === 'azure') {
        const azureConfig = config as any;
        if (azureConfig.endpoint) {
          const endpointRegex = /^AZURE_SPEECH_ENDPOINT=.*/m;
          envContent = endpointRegex.test(envContent) 
            ? envContent.replace(endpointRegex, `AZURE_SPEECH_ENDPOINT=${azureConfig.endpoint}`)
            : envContent + `\nAZURE_SPEECH_ENDPOINT=${azureConfig.endpoint}`;
        }
        if (azureConfig.region) {
          const regionRegex = /^AZURE_SPEECH_REGION=.*/m;
          envContent = regionRegex.test(envContent) 
            ? envContent.replace(regionRegex, `AZURE_SPEECH_REGION=${azureConfig.region}`)
            : envContent + `\nAZURE_SPEECH_REGION=${azureConfig.region}`;
        }
      }

      if (provider === 'google') {
        const googleConfig = config as any;
        if (googleConfig.projectId) {
          const projectRegex = /^GOOGLE_CLOUD_PROJECT=.*/m;
          envContent = projectRegex.test(envContent) 
            ? envContent.replace(projectRegex, `GOOGLE_CLOUD_PROJECT=${googleConfig.projectId}`)
            : envContent + `\nGOOGLE_CLOUD_PROJECT=${googleConfig.projectId}`;
        }
      }
    }

    fs.writeFileSync(this.envPath, envContent);
    console.log('✅ Updated .env file with provider configurations');
  }

  private async updateTTSConfig(): Promise<void> {
    let configContent = fs.readFileSync(this.configPath, 'utf8');

    // Update provider enabled status in TTSConfig.ts
    for (const [provider, config] of Object.entries(this.providers)) {
      const providerRegex = new RegExp(`(${provider}: \\{[^}]*enabled: )(true|false)([^}]*\\})`, 'm');
      if (providerRegex.test(configContent)) {
        configContent = configContent.replace(
          providerRegex,
          `$1${config.enabled}$3`
        );
      }
    }

    fs.writeFileSync(this.configPath, configContent);
    console.log('✅ Updated TTSConfig.ts with provider enabled status');
  }

  private displaySetupSummary(): void {
    console.log('\n📋 Setup Summary');
    console.log('===============');
    
    for (const [provider, config] of Object.entries(this.providers)) {
      console.log(`\n${provider.toUpperCase()}:`);
      console.log(`  Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}`);
      console.log(`  API Key: ${config.apiKey.substring(0, 8)}...${config.apiKey.substring(config.apiKey.length - 4)}`);
      
      if (config.endpoint) {
        console.log(`  Endpoint: ${config.endpoint}`);
      }
      if (config.region) {
        console.log(`  Region: ${config.region}`);
      }
      if (config.projectId) {
        console.log(`  Project ID: ${config.projectId}`);
      }
    }

    console.log('\n📝 Next Steps:');
    console.log('1. Run: npm run test:tts');
    console.log('2. Check provider health status');
    console.log('3. Test TTS generation with different providers');
    console.log('4. Configure budget limits in TTSConfig.ts if needed');
  }

  async run(): Promise<void> {
    console.log('🎤 TTS Provider Setup Wizard');
    console.log('===========================');
    console.log('This script will help you configure TTS providers with API keys.\n');

    // Check if .env file exists
    if (!fs.existsSync(this.envPath)) {
      console.log('❌ .env file not found. Please create it from .env.example first.');
      process.exit(1);
    }

    try {
      // Setup each provider
      await this.setupElevenLabs();
      await this.setupOpenAI();
      await this.setupAzure();
      await this.setupGoogle();
      await this.setupKokoro();

      // Update configuration files
      await this.updateEnvFile();
      await this.updateTTSConfig();

      // Display summary
      this.displaySetupSummary();

    } catch (error) {
      console.error('❌ Setup failed:', error);
      process.exit(1);
    } finally {
      this.rl.close();
    }
  }
}

// Helper function for confirmation
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Run the setup if this script is executed directly
if (require.main === module) {
  const setup = new TTSSetup();
  setup.run().catch(console.error);
}

export { TTSSetup };