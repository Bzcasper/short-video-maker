import axios from "axios";
import { logger } from "../../logger";
import { Config } from "../../config";

export class VercelAI {
  private apiKey: string;
  private apiUrl: string;

  constructor(config: Config) {
    this.apiKey = config.vercelApiKey || "";
    this.apiUrl = config.vercelApiUrl || "https://api.vercel-ai.com/v1";
    if (!this.apiKey) {
      logger.warn("Vercel AI credentials not configured. API calls will fail.");
    }
  }

  public async suggestVideoBackground(
    content: string,
    videoId: string,
  ): Promise<string[]> {
    if (!this.apiKey) {
      logger.error(
        "Vercel AI credentials not set. Cannot suggest video background.",
      );
      return [];
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Vercel AI for video background suggestions",
      );
      const response = await axios.post(
        `${this.apiUrl}/suggest-video`,
        {
          prompt: `Suggest background videos for content: "${content}"`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data && response.data.suggestions) {
        logger.debug(
          { videoId, suggestions: response.data.suggestions },
          "Received video background suggestions from Vercel AI",
        );
        return response.data.suggestions;
      } else {
        logger.error(
          { response },
          "Unexpected response format from Vercel AI API for video suggestions",
        );
        return [];
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error getting video background suggestions from Vercel AI",
      );
      return [];
    }
  }

  public async suggestMusic(
    content: string,
    videoId: string,
  ): Promise<string[]> {
    if (!this.apiKey) {
      logger.error("Vercel AI credentials not set. Cannot suggest music.");
      return [];
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Vercel AI for music suggestions",
      );
      const response = await axios.post(
        `${this.apiUrl}/suggest-music`,
        {
          prompt: `Suggest background music for content: "${content}"`,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data && response.data.suggestions) {
        logger.debug(
          { videoId, suggestions: response.data.suggestions },
          "Received music suggestions from Vercel AI",
        );
        return response.data.suggestions;
      } else {
        logger.error(
          { response },
          "Unexpected response format from Vercel AI API for music suggestions",
        );
        return [];
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error getting music suggestions from Vercel AI",
      );
      return [];
    }
  }

  public async suggestScript(
    content: string,
    videoId: string,
  ): Promise<string[]> {
    try {
      logger.info(
        { videoId },
        "Sending request to Cloudflare worker for script suggestions",
      );
      const response = await axios.post(
        "https://trendradar-ai-agent-dev.robertmcasper.workers.dev/agent/run", // Replace with your Cloudflare worker URL
        {
          task: `Suggest script ideas or improvements for content: "${content}"`,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (
        response.data &&
        response.data.result &&
        response.data.result.output
      ) {
        logger.debug(
          { videoId, suggestions: response.data.result.output },
          "Received script suggestions from Cloudflare worker",
        );
        return [response.data.result.output]; // Wrap the output in an array
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare worker API for script suggestions",
        );
        return [];
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error getting script suggestions from Cloudflare worker",
      );
      return [];
    }
  }
}

