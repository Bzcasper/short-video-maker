# Short Video Maker – How It Works

## Overview

**Short Video Maker** is an open-source tool for automated short-form video creation (YouTube, TikTok, Instagram). It combines text-to-speech, automatic captions, background videos, and music to generate engaging videos from simple text inputs.

- **Free alternative** to GPU-heavy or expensive API-based video generation.
- Does **not** generate videos from scratch based on images or prompts.

## Features

- Generate complete short videos from text prompts
- Text-to-speech conversion (Kokoro TTS)
- Automatic caption generation and styling (Whisper)
- Background video search via Pexels
- Background music with genre/mood selection
- REST API and Model Context Protocol (MCP) server

## How It Works

1. **Input:** Simple text and search terms
2. **Text-to-Speech:** Converts text using Kokoro TTS
3. **Captions:** Generates captions via Whisper
4. **Background:** Finds relevant videos from Pexels
5. **Composition:** Combines all elements with Remotion
6. **Render:** Outputs a professional short video with timed captions

## Limitations

- Only English voiceover (Kokoro-js limitation)
- Background videos sourced from Pexels
- Windows not supported (Whisper.cpp installation issues)

## Requirements

- Internet connection
- Free Pexels API key
- ≥ 3 GB RAM (recommended: 4 GB)
- ≥ 2 vCPU
- ≥ 5 GB disk space

## Getting Started

### Docker (Recommended)

Three images available: **tiny**, **normal**, **cuda** (GPU acceleration).

Example (tiny):
```bash
docker run -it --rm --name short-video-maker -p 3123:3123 -e LOG_LEVEL=debug -e PEXELS_API_KEY= gyoridavid/short-video-maker:latest-tiny
```

### Docker Compose

```yaml
version: "3"
services:
    short-video-maker:
        image: gyoridavid/short-video-maker:latest-tiny
        environment:
            - LOG_LEVEL=debug
            - PEXELS_API_KEY=
        ports:
            - "3123:3123"
        volumes:
            - ./videos:/app/data/videos
```

### NPM

- Ubuntu ≥ 22.04 (see required packages)
- Mac OS (brew install ffmpeg, node.js 22+)
- Windows not supported

## Usage

### Environment Variables

| Key                   | Description                         | Default      |
|-----------------------|-------------------------------------|--------------|
| PEXELS_API_KEY        | Free Pexels API key                 |              |
| LOG_LEVEL             | Pino log level                      | info         |
| WHISPER_VERBOSE       | Whisper.cpp output to stdout        | false        |
| PORT                  | Server port                         | 3123         |
| KOKORO_MODEL_PRECISION| Kokoro model size (fp32, q4, etc.)  | depends      |
| CONCURRENCY           | Parallel browser tabs for rendering  | depends      |
| VIDEO_CACHE_SIZE_IN_BYTES | Remotion frame cache size        | depends      |
| WHISPER_MODEL         | Whisper.cpp model                   | depends      |
| DATA_DIR_PATH         | Data directory                      | ~/.ai-agents-az-video-generator (npm), /app/data (Docker) |
| DOCKER                | Running in Docker                   | true/false   |
| DEV                   | Development mode                    | false        |

### Configuration Options

| Key                   | Description                         | Default      |
|-----------------------|-------------------------------------|--------------|
| paddingBack           | End screen duration (ms)            | 0            |
| music                 | Background music mood               | random       |
| captionPosition       | Caption position (top/center/bottom)| bottom       |
| captionBackgroundColor| Caption background color            | blue         |
| voice                 | Kokoro voice                        | af_heart     |
| orientation           | Video orientation                   | portrait     |

## REST API

- **GET /health** – Health check
- **POST /api/short-video** – Create video
- **GET /api/short-video/{id}/status** – Video status
- **GET /api/short-video/{id}** – Download video
- **GET /api/short-videos** – List videos
- **DELETE /api/short-video/{id}** – Delete video
- **GET /api/voices** – List available voices
- **GET /api/music-tags** – List music moods

## Concepts

### Scene

Each video consists of multiple scenes:
- **Text:** Narration for TTS and captions
- **Search terms:** Keywords for Pexels video search (fallback: nature, globe, space, ocean)

## Troubleshooting

- Ensure ≥ 3 GB RAM for Docker
- For WSL2, set resource limits via wsl utility or Docker Desktop
- For npm, install all required packages

## FAQ

- **Other languages?** Not supported (English only)
- **Custom images/videos?** Not supported
- **Recommended run method?** Docker
- **GPU usage?** Minimal (Whisper.cpp only)
- **UI available?** Not yet
- **Alternative video sources?** Not supported

## Dependencies

| Dependency     | Version      | License      | Purpose                       |
|----------------|--------------|-------------|-------------------------------|
| Remotion       | ^4.0.286     | Remotion    | Video composition/rendering   |
| Whisper CPP    | v1.5.5       | MIT         | Speech-to-text for captions   |
| FFmpeg         | ^2.1.3       | LGPL/GPL    | Audio/video manipulation      |
| Kokoro.js      | ^1.2.0       | MIT         | Text-to-speech generation     |
| Pexels API     | N/A          | Pexels      | Background videos             |

## Contributing

PRs welcome! See `CONTRIBUTING.md` for setup instructions.

## License

MIT License

## Acknowledgments

- ❤️ Remotion – programmatic video generation
- ❤️ Whisper – speech-to-text
- ❤️ Pexels – video content
- ❤️ FFmpeg – audio/video processing
- ❤️ Kokoro – TTS

---

*For support and premium content, join the Skool community. Check out the AI Agents A-Z YouTube channel for tutorials and updates.*

