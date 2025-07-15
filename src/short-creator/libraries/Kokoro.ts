import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import {
  LanguageEnum,
  VoiceEnum,
  type kokoroModelPrecision,
  type Voices,
} from "../../types/shorts";
import { KOKORO_MODEL, logger } from "../../config";

export class Kokoro {
  constructor(private tts: KokoroTTS) {}

  async generate(
    text: string,
    voice: Voices,
  ): Promise<{
    audio: ArrayBuffer;
    audioLength: number;
  }> {
    const splitter = new TextSplitterStream();
    const stream = this.tts.stream(splitter, {
      voice,
    });
    splitter.push(text);
    splitter.close();

    const output = [];
    for await (const audio of stream) {
      output.push(audio);
    }

    const audioBuffers: ArrayBuffer[] = [];
    let audioLength = 0;
    for (const audio of output) {
      audioBuffers.push(audio.audio.toWav());
      audioLength += audio.audio.audio.length / audio.audio.sampling_rate;
    }

    const mergedAudioBuffer = Kokoro.concatWavBuffers(audioBuffers);
    logger.debug({ text, voice, audioLength }, "Audio generated with Kokoro");

    return {
      audio: mergedAudioBuffer,
      audioLength: audioLength,
    };
  }

  static concatWavBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const header = Buffer.from(buffers[0].slice(0, 44));
    let totalDataLength = 0;

    const dataParts = buffers.map((buf) => {
      const b = Buffer.from(buf);
      const data = b.slice(44);
      totalDataLength += data.length;
      return data;
    });

    header.writeUInt32LE(36 + totalDataLength, 4);
    header.writeUInt32LE(totalDataLength, 40);

    return Buffer.concat([header, ...dataParts]);
  }

  static async init(dtype: kokoroModelPrecision): Promise<Kokoro> {
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype,
      device: "cpu", // only "cpu" is supported in node
    });

    return new Kokoro(tts);
  }

  listAvailableVoices(language?: LanguageEnum): Voices[] {
    const voices = Object.values(VoiceEnum) as Voices[];
    if (!language) {
      return voices;
    }
    // Filter voices based on language prefix if applicable
    // Currently, Kokoro mainly supports English, with limited support for other languages
    switch (language) {
      case LanguageEnum.en:
        return voices.filter(
          (v) =>
            v.startsWith("af_") ||
            v.startsWith("am_") ||
            v.startsWith("bf_") ||
            v.startsWith("bm_"),
        );
      case LanguageEnum.es:
        return voices.filter((v) => v.startsWith("af_")); // Limited to available voices, to be expanded
      case LanguageEnum.fr:
        return voices.filter((v) => v.startsWith("af_")); // Limited to available voices, to be expanded
      case LanguageEnum.ja:
        return voices.filter((v) => v.startsWith("af_")); // Placeholder for Japanese voices
      case LanguageEnum.zh:
        return voices.filter((v) => v.startsWith("af_")); // Placeholder for Mandarin voices
      case LanguageEnum.hi:
        return voices.filter((v) => v.startsWith("af_")); // Placeholder for Hindi voices
      case LanguageEnum.it:
        return voices.filter((v) => v.startsWith("af_")); // Placeholder for Italian voices
      case LanguageEnum.pt:
        return voices.filter((v) => v.startsWith("af_")); // Placeholder for Portuguese voices
      default:
        return voices.filter((v) => v.startsWith("af_")); // Default to a subset of English voices
    }
  }

  getDefaultVoiceForLanguage(language: LanguageEnum): Voices {
    switch (language) {
      case LanguageEnum.en:
        return VoiceEnum.af_heart;
      case LanguageEnum.es:
        return VoiceEnum.af_bella; // Using a voice that could fit Spanish tone, to be updated with actual support
      case LanguageEnum.fr:
        return VoiceEnum.af_nicole; // Using a voice that could fit French tone, to be updated with actual support
      case LanguageEnum.ja:
        return VoiceEnum.af_aoede; // Placeholder for Japanese voice
      case LanguageEnum.zh:
        return VoiceEnum.af_river; // Placeholder for Mandarin voice
      case LanguageEnum.hi:
        return VoiceEnum.af_sarah; // Placeholder for Hindi voice
      case LanguageEnum.it:
        return VoiceEnum.af_kore; // Placeholder for Italian voice
      case LanguageEnum.pt:
        return VoiceEnum.af_jessica; // Placeholder for Portuguese voice
      default:
        return VoiceEnum.af_heart; // Default to English voice
    }
  }
}
