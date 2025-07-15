# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a short-form video generation service that creates TikTok, Instagram Reels, and YouTube Shorts from text inputs. The system combines text-to-speech, automatic captions, background videos from Pexels, and background music to create engaging short videos.

The project exposes both a REST API and a Model Context Protocol (MCP) server for video generation.

## Architecture

### Core Components

- **ShortCreator**: Main orchestrator that coordinates all video generation services
- **Libraries**: Abstraction layer for external services:
  - `Kokoro`: Text-to-speech generation
  - `Whisper`: Speech-to-text for caption generation
  - `Remotion`: Video composition and rendering
  - `FFmpeg`: Audio/video manipulation
  - `PexelsAPI`: Background video sourcing
- **Server**: Express.js server with dual endpoints (REST + MCP)
- **Config**: Environment-based configuration management

### Key Directories

- `src/short-creator/`: Core video generation logic and library integrations
- `src/server/`: Express server and routing (REST API + MCP endpoints)
- `src/ui/`: React-based web interface for video creation
- `src/components/`: Remotion video components (LandscapeVideo, PortraitVideo)
- `static/music/`: Pre-selected background music files

## Development Commands

### Build & Development
```bash
# Development with hot reload
npm run dev
pnpm dev

# Build for production
npm run build

# Start production server
npm start
```

### UI Development
```bash
# Start UI development server (port 3000, proxies to API on 3123)
npm run ui:dev

# Build UI
npm run ui:build

# Preview UI build
npm run ui:preview
```

### Testing & Quality
```bash
# Run tests
npm test
vitest

# Run linting
npx eslint .

# Format code
npx prettier --write .

# Run all quality checks
make all  # runs fmt, lint, test
```

### Video Preview & Debugging
```bash
# Open Remotion Studio for video template preview
npx remotion studio
```

## Environment Configuration

### Required Environment Variables
- `PEXELS_API_KEY`: Free API key from Pexels for background videos

### Optional Configuration
- `LOG_LEVEL`: Logging level (default: "info")
- `PORT`: Server port (default: 3123)
- `WHISPER_MODEL`: Whisper model size (default: "medium.en")
- `KOKORO_MODEL_PRECISION`: TTS model precision (default: "fp32")

### Performance Tuning (Docker)
- `CONCURRENCY`: Remotion browser tabs for rendering
- `VIDEO_CACHE_SIZE_IN_BYTES`: Remotion video cache size

## API Endpoints

### REST API (`/api`)
- `POST /api/short-video`: Create video from scenes
- `GET /api/short-video/{id}/status`: Check video status
- `GET /api/short-video/{id}`: Download video binary
- `GET /api/short-videos`: List all videos
- `DELETE /api/short-video/{id}`: Delete video
- `GET /api/voices`: Available TTS voices
- `GET /api/music-tags`: Available music moods

### MCP Server (`/mcp`)
- `/mcp/sse`: Server-sent events endpoint
- `/mcp/messages`: MCP messages endpoint

## Video Generation Flow

1. **Text Input**: Scenes with narration text and search terms
2. **TTS Generation**: Kokoro converts text to speech
3. **Caption Generation**: Whisper transcribes audio for precise captions
4. **Video Search**: Pexels API finds relevant background videos
5. **Composition**: Remotion assembles audio, video, captions, and music
6. **Rendering**: Final MP4 output with synchronized elements

## Development Notes

- The project uses TypeScript with strict configuration
- Remotion handles video composition and rendering
- FFmpeg is used for audio manipulation and format conversion
- Music files are pre-selected and stored in `static/music/`
- The system supports both portrait and landscape video orientations
- Web UI provides a user-friendly interface for non-API usage

## Testing

- Tests use Vitest framework
- Main test coverage focuses on core video generation logic
- Mock data for Pexels API responses available in `__mocks__/`
- Use `npm test` for running the test suite

## Docker Support

The project provides three Docker variants:
- **tiny**: Minimal resources, quantized models
- **normal**: Standard setup with base models
- **cuda**: GPU acceleration for Whisper transcription