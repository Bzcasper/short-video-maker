import axios from "axios";
import { logger } from "../../logger";
import { Config } from "../../config";

export class SunoAI {
  private apiUrl: string;
  private cookie: string;
  private twoCaptchaKey: string;

  constructor(config: Config) {
    this.apiUrl = config.sunoApiUrl || "http://localhost:3000";
    this.cookie = config.sunoCookie || "";
    this.twoCaptchaKey = config.twoCaptchaKey || "";
    if (!this.cookie || !this.twoCaptchaKey) {
      logger.warn(
        "Suno AI credentials not fully configured. API calls will fail.",
      );
    }
  }

  public async generateMusic(
    prompt: string,
    mood: string,
    videoId: string,
  ): Promise<{ id: string; audio_url: string }[]> {
    if (!this.cookie || !this.twoCaptchaKey) {
      logger.error("Suno AI credentials not set. Cannot generate music.");
      return []; // Return empty array as fallback
    }

    try {
      logger.info(
        { videoId, prompt, mood },
        "Sending request to Suno AI for music generation",
      );
      const response = await axios.post(
        `${this.apiUrl}/api/generate`,
        {
          prompt: `${prompt} in a ${mood} mood`,
          make_instrumental: false,
          wait_audio: true,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Cookie: this.cookie,
          },
        },
      );

      if (
        response.data &&
        Array.isArray(response.data) &&
        response.data.length > 0
      ) {
        logger.debug(
          { videoId, responseData: response.data },
          "Received music data from Suno AI",
        );
        return response.data
          .map((item: { id: string; audio_url?: string }) => ({
            id: item.id,
            audio_url: item.audio_url || "",
          }))
          .filter((item: { audio_url: string }) => item.audio_url);
      } else {
        logger.error(
          { response },
          "Unexpected response format from Suno AI API",
        );
        return []; // Fallback to empty array
      }
    } catch (error: unknown) {
      logger.error({ error, videoId }, "Error generating music with Suno AI");
      return []; // Fallback to empty array on error
    }
  }
}

