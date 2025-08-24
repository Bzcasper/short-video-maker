# TTS Provider Setup Guide

This guide provides step-by-step instructions for setting up each TTS provider with API keys and configuration.

## Prerequisites

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Provider Setup Instructions

### 1. ElevenLabs TTS

**Steps:**
1. Sign up at [ElevenLabs](https://elevenlabs.io/)
2. Go to your profile → API Keys
3. Generate a new API key
4. Add to `.env`:
   ```
   ELEVENLABS_API_KEY=your_actual_api_key_here
   ```

**Pricing:** $0.03 per 1000 characters
**Features:** High-quality voices, multiple languages, emotional control

### 2. OpenAI TTS

**Steps:**
1. Sign up at [OpenAI Platform](https://platform.openai.com/)
2. Go to API Keys section
3. Generate a new API key
4. Add to `.env`:
   ```
   OPENAI_API_KEY=your_actual_api_key_here
   ```

**Pricing:** $0.015 per 1000 characters
**Features:** Clean voices, good language support

### 3. Azure Speech Services

**Steps:**
1. Create Azure account at [Azure Portal](https://portal.azure.com/)
2. Create a Speech Services resource
3. Get the API key and endpoint from the resource overview
4. Add to `.env`:
   ```
   AZURE_SPEECH_KEY=your_azure_speech_key_here
   AZURE_SPEECH_ENDPOINT=your_azure_speech_endpoint_here
   AZURE_SPEECH_REGION=your_azure_region_here
   ```

**Pricing:** $0.016 per 1000 characters
**Features:** Neural voices, extensive language support, SSML support

### 4. Google Cloud Text-to-Speech

**Steps:**
1. Create Google Cloud account at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Text-to-Speech API
3. Create API credentials
4. Add to `.env`:
   ```
   GOOGLE_TTS_API_KEY=your_google_tts_api_key_here
   GOOGLE_CLOUD_PROJECT=your_google_cloud_project_id_here
   ```

**Pricing:** $0.016 per 1000 characters
**Features:** WaveNet voices, multiple languages, SSML support

### 5. Kokoro TTS (Existing Provider)

**Steps:**
1. Ensure you have Kokoro API credentials
2. Add to `.env`:
   ```
   KOKORO_API_KEY=your_kokoro_api_key_here
   KOKORO_API_ENDPOINT=https://api.kokoro.io/v1
   ```

**Pricing:** $0.02 per 1000 characters
**Features:** Existing integration, fallback option

## Configuration

After setting up API keys, configure providers in `src/short-creator/libraries/TTSConfig.ts`:

```typescript
// Enable providers
const configManager = getTTSConfigManager();
configManager.updateProviderConfig('elevenlabs', { enabled: true });
configManager.updateProviderConfig('openai', { enabled: true });
// ... etc
```

Or use environment variables to enable providers:

```bash
# Enable specific providers
ENABLE_ELEVENLABS=true
ENABLE_OPENAI=true
ENABLE_AZURE=false
ENABLE_GOOGLE=false
```

## Testing the Setup

Run the test script to verify all providers:

```bash
npm run test:tts
```

Or create a simple test file:

```typescript
import { TTSService } from './src/short-creator/libraries/TTSService';

async function testTTS() {
  const ttsService = TTSService.getInstance();
  const result = await ttsService.synthesizeSpeech('Hello world', 'en');
  console.log('TTS Result:', result);
}

testTTS().catch(console.error);
```

## Troubleshooting

### Common Issues

1. **API Key Errors**: Verify API keys are correct and have proper permissions
2. **Rate Limiting**: Check provider rate limits in the configuration
3. **Network Issues**: Ensure proper internet connectivity
4. **Provider Downtime**: Check provider status pages

### Provider Status Pages

- [ElevenLabs Status](https://status.elevenlabs.io/)
- [OpenAI Status](https://status.openai.com/)
- [Azure Status](https://status.azure.com/)
- [Google Cloud Status](https://status.cloud.google.com/)

## Cost Management

Monitor usage through the built-in analytics:

```typescript
const analytics = ttsService.getUsageAnalytics();
console.log('Monthly cost:', analytics.monthlyCost);
console.log('Characters used:', analytics.charactersThisMonth);
```

Set budget limits in the configuration to prevent unexpected charges.

## Security Notes

- Never commit `.env` files to version control
- Use environment-specific configuration
- Rotate API keys regularly
- Monitor usage for suspicious activity