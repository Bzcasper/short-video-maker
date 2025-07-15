process.env.LOG_LEVEL = "debug";

import { test, expect, vi } from "vitest";
import fs from "fs-extra";

import { ShortCreator } from "./ShortCreator";
import { Kokoro } from "./libraries/Kokoro";
import { Remotion } from "./libraries/Remotion";
import { Whisper } from "./libraries/Whisper";
import { FFMpeg } from "./libraries/FFmpeg";
import { PexelsAPI } from "./libraries/Pexels";
import { Config } from "../config";
import { MusicManager } from "./music";

// mock fs-extra
vi.mock("fs-extra", async () => {
  const { createFsFromVolume, Volume } = await import("memfs");
  const vol = Volume.fromJSON({
    "/Users/gyoridavid/.ai-agents-az-video-generator/videos/video-1.mp4":
      "mock video content 1",
    "/Users/gyoridavid/.ai-agents-az-video-generator/videos/video-2.mp4":
      "mock video content 2",
    "/Users/gyoridavid/.ai-agents-az-video-generator/temp": null,
    "/Users/gyoridavid/.ai-agents-az-video-generator/libs": null,
    "/static/music/happy-music.mp3": "mock music content",
    "/static/music/sad-music.mp3": "mock music content",
    "/static/music/chill-music.mp3": "mock music content",
  });
  const memfs = createFsFromVolume(vol);

  const fsExtra = {
    ...memfs,
    // fs-extra specific methods
    ensureDirSync: vi.fn((path) => {
      try {
        memfs.mkdirSync(path, { recursive: true });
      } catch {
        // Ignore errors
      }
    }),
    removeSync: vi.fn((path) => {
      try {
        const stats = memfs.statSync(path);
        if (stats.isDirectory()) {
          // This is simplified and won't handle nested directories
          memfs.rmdirSync(path);
        } else {
          memfs.unlinkSync(path);
        }
      } catch {
        // Ignore errors
      }
    }),
    createWriteStream: vi.fn(() => ({
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    })),
    readFileSync: vi.fn((path) => {
      return memfs.readFileSync(path);
    }),
  };
  return {
    ...fsExtra,
    default: fsExtra,
  };
});

// Mock fluent-ffmpeg
vi.mock("fluent-ffmpeg", () => {
  const mockOn = vi.fn().mockReturnThis();
  const mockSave = vi.fn().mockReturnThis();
  const mockPipe = vi.fn().mockReturnThis();

  const ffmpegMock = vi.fn(() => ({
    input: vi.fn().mockReturnThis(),
    audioCodec: vi.fn().mockReturnThis(),
    audioBitrate: vi.fn().mockReturnThis(),
    audioChannels: vi.fn().mockReturnThis(),
    audioFrequency: vi.fn().mockReturnThis(),
    toFormat: vi.fn().mockReturnThis(),
    on: mockOn,
    save: mockSave,
    pipe: mockPipe,
  }));

  ffmpegMock.setFfmpegPath = vi.fn();

  return { default: ffmpegMock };
});

// mock kokoro-js
vi.mock("kokoro-js", () => {
  // Create a proper WAV header buffer (44 bytes)
  const createMockWavBuffer = () => {
    const buffer = new ArrayBuffer(44 + 1000); // Header + some audio data
    const view = new DataView(buffer);
    
    // WAV header
    view.setUint32(0, 0x46464952, true); // "RIFF"
    view.setUint32(4, 36 + 1000, true); // File size - 8
    view.setUint32(8, 0x45564157, true); // "WAVE"
    view.setUint32(12, 0x20746d66, true); // "fmt "
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // Audio format (PCM)
    view.setUint16(22, 1, true); // Number of channels
    view.setUint32(24, 44100, true); // Sample rate
    view.setUint32(28, 44100 * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    view.setUint32(36, 0x61746164, true); // "data"
    view.setUint32(40, 1000, true); // Data size
    
    return buffer;
  };

  const mockAudioObject = {
    toWav: vi.fn().mockReturnValue(createMockWavBuffer()),
    audio: new ArrayBuffer(1000),
    sampling_rate: 44100,
  };

  const mockAsyncIterator = {
    async *[Symbol.asyncIterator]() {
      yield {
        audio: mockAudioObject,
      };
    },
  };

  return {
    KokoroTTS: {
      from_pretrained: vi.fn().mockResolvedValue({
        stream: vi.fn().mockReturnValue(mockAsyncIterator),
        generate: vi.fn().mockResolvedValue({
          toWav: vi.fn().mockReturnValue(createMockWavBuffer()),
          audio: new ArrayBuffer(1000),
          sampling_rate: 44100,
        }),
      }),
    },
    TextSplitterStream: vi.fn().mockImplementation(() => ({
      push: vi.fn(),
      close: vi.fn(),
    })),
  };
});

// mock remotion
vi.mock("@remotion/bundler", () => {
  return {
    bundle: vi.fn().mockResolvedValue("mocked-bundled-url"),
  };
});
vi.mock("@remotion/renderer", () => {
  return {
    renderMedia: vi.fn().mockResolvedValue(undefined),
    selectComposition: vi.fn().mockResolvedValue({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 300,
    }),
    ensureBrowser: vi.fn().mockResolvedValue(undefined),
  };
});

// mock whisper
vi.mock("@remotion/install-whisper-cpp", () => {
  return {
    downloadWhisperModel: vi.fn().mockResolvedValue(undefined),
    installWhisperCpp: vi.fn().mockResolvedValue(undefined),
    transcribe: vi.fn().mockResolvedValue({
      transcription: [
        {
          text: "This is a mock transcription.",
          offsets: { from: 0, to: 2000 },
          tokens: [
            { text: "This", timestamp: { from: 0, to: 500 } },
            { text: " is", timestamp: { from: 500, to: 800 } },
            { text: " a", timestamp: { from: 800, to: 1000 } },
            { text: " mock", timestamp: { from: 1000, to: 1500 } },
            { text: " transcription.", timestamp: { from: 1500, to: 2000 } },
          ],
        },
      ],
    }),
  };
});

test("test me", async () => {
  const kokoro = await Kokoro.init("fp16");
  const ffmpeg = await FFMpeg.init();

  vi.spyOn(ffmpeg, "saveNormalizedAudio").mockResolvedValue("mocked-path.wav");
  vi.spyOn(ffmpeg, "saveToMp3").mockResolvedValue("mocked-path.mp3");

  const pexelsAPI = new PexelsAPI("mock-api-key");
  vi.spyOn(pexelsAPI, "findVideo").mockResolvedValue({
    id: "mock-video-id-1",
    url: "https://example.com/mock-video-1.mp4",
    width: 1080,
    height: 1920,
  });

  const config = new Config();
  const remotion = await Remotion.init(config);

  // control the render promise resolution
  let resolveRenderPromise: () => void;
  const renderPromiseMock: Promise<void> = new Promise((resolve) => {
    resolveRenderPromise = resolve;
  });
  vi.spyOn(remotion, "render").mockReturnValue(renderPromiseMock);

  const whisper = await Whisper.init(config);

  vi.spyOn(whisper, "CreateCaption").mockResolvedValue([
    { text: "This", startMs: 0, endMs: 500 },
    { text: " is", startMs: 500, endMs: 800 },
    { text: " a", startMs: 800, endMs: 1000 },
    { text: " mock", startMs: 1000, endMs: 1500 },
    { text: " transcription.", startMs: 1500, endMs: 2000 },
  ]);

  const musicManager = new MusicManager(config);

  const shortCreator = new ShortCreator(
    config,
    remotion,
    kokoro,
    whisper,
    ffmpeg,
    pexelsAPI,
    musicManager,
  );

  const videoId = shortCreator.addToQueue(
    [
      {
        text: "test",
        searchTerms: ["test"],
      },
    ],
    {},
  );

  // list videos while the video is being processed
  let videos = shortCreator.listAllVideos();
  expect(videos.find((v) => v.id === videoId)?.status).toBe("processing");

  // create the video file on the file system and check the status again
  fs.writeFileSync(shortCreator.getVideoPath(videoId), "mock video content");
  videos = shortCreator.listAllVideos();
  expect(videos.find((v) => v.id === videoId)?.status).toBe("processing");

  // resolve the render promise to simulate the video being processed, and check the status again
  resolveRenderPromise();
  await new Promise((resolve) => setTimeout(resolve, 100)); // let the queue process the video
  videos = shortCreator.listAllVideos();
  expect(videos.find((v) => v.id === videoId)?.status).toBe("ready");

  // check the status of the video directly
  const status = shortCreator.status(videoId);
  expect(status).toBe("ready");
});
