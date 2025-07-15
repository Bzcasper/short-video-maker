# Contributing to Shorts Creator

## How to Setup the Development Environment

1. Clone the repository

   ```bash
   git clone git@github.com:gyoridavid/short-video-maker.git
   cd short-video-maker
   ```

2. Install dependencies

   ```bash
   pnpm install
   ```

3. Copy `.env.example` to `.env` and set the right environment variables. Ensure you provide a valid Pexels API key for background video sourcing.

4. Start the server
   ```bash
   pnpm dev
   ```

## How to Preview Videos and Debug the Rendering Process

You can use Remotion Studio to preview videos. Make sure to update the template if the underlying data structure changes.

```bash
npx remotion studio
```

## Developing with Multi-Language Support

To test and develop multi-language support for voiceovers and captions:

- Update the `language` field in the `renderConfig` object within `src/types/shorts.ts` to include new languages if needed.
- Modify `src/short-creator/libraries/Kokoro.ts` to map new languages to appropriate voices based on Kokoro documentation.
- Ensure Whisper model selection in `src/short-creator/ShortCreator.ts` uses `medium` for non-English languages for multi-lingual transcription.

## Developing with GPU Acceleration

To leverage GPU acceleration for faster transcription during development:

- Ensure you have an NVIDIA GPU and the necessary drivers installed.
- Use the CUDA-optimized Docker image for testing: `gyoridavid/short-video-maker:latest-cuda`.
- Run the Docker container with GPU support:
  ```bash
  docker run -it --rm --name short-video-maker -p 3123:3123 -e LOG_LEVEL=debug -e PEXELS_API_KEY=your_pexels_api_key --gpus=all gyoridavid/short-video-maker:latest-cuda
  ```
- Note that GPU acceleration applies only to Whisper.cpp for transcription; Remotion rendering remains CPU-intensive.
