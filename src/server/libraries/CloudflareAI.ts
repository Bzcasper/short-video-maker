import axios from "axios";
import { logger } from "../../logger";
import { Config } from "../../config";

export class CloudflareAI {
  private apiKey: string;
  private accountId: string;
  private model: string;

  constructor(config: Config) {
    this.apiKey =
      config.cloudflareApiKey || "f7b173714d96bad886f117b631084373726e2";
    this.accountId =
      config.cloudflareAccountId || "baab563e18b354dcc5e12e965471a469";
    this.model = config.cloudflareModel || "@cf/meta/llama-2-7b-chat-int8";
    if (!this.apiKey || !this.accountId) {
      logger.warn(
        "Cloudflare AI credentials not fully configured. API calls will fail.",
      );
    }
  }

  public async enhanceCaption(text: string, videoId: string): Promise<string> {
    if (!this.apiKey || !this.accountId) {
      logger.error(
        "Cloudflare AI credentials not set. Cannot enhance caption.",
      );
      return text; // Return original text as fallback
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Cloudflare Workers AI for caption enhancement",
      );
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
        {
          messages: [
            {
              role: "system",
              content:
                "You are an expert in creating engaging video captions. Enhance the following text to make it more captivating for short video content.",
            },
            {
              role: "user",
              content: `Enhance this caption: "${text}"`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (
        response.data &&
        response.data.result &&
        response.data.result.response
      ) {
        logger.debug(
          { videoId, enhancedText: response.data.result.response },
          "Received enhanced caption from Cloudflare AI",
        );
        return response.data.result.response;
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare AI API",
        );
        return text; // Fallback to original text
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error enhancing caption with Cloudflare AI",
      );
      return text; // Fallback to original text on error
    }
  }
  public async generateStoryScript(
    prompt: string,
    videoId: string,
  ): Promise<string> {
    if (!this.apiKey || !this.accountId) {
      logger.error(
        "Cloudflare AI credentials not set. Cannot generate story script.",
      );
      return "";
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Cloudflare Workers AI for story script generation",
      );
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
        {
          messages: [
            {
              role: "system",
              content:
                "You are an expert in creating engaging short video scripts. Generate a compelling story script based on the given prompt.",
            },
            {
              role: "user",
              content: `Generate a story script for: "${prompt}"`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (
        response.data &&
        response.data.result &&
        response.data.result.response
      ) {
        logger.debug(
          { videoId, script: response.data.result.response },
          "Received story script from Cloudflare AI",
        );
        return response.data.result.response;
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare AI API for story script",
        );
        return "";
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error generating story script with Cloudflare AI",
      );
      return "";
    }
  }

  public async generateKeywords(
    theme: string,
    videoId: string,
  ): Promise<string[]> {
    if (!this.apiKey || !this.accountId) {
      logger.error(
        "Cloudflare AI credentials not set. Cannot generate keywords.",
      );
      return [];
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Cloudflare Workers AI for keyword generation",
      );
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
        {
          messages: [
            {
              role: "system",
              content:
                "You are an expert in identifying relevant keywords for video themes. Generate a list of keywords based on the given theme.",
            },
            {
              role: "user",
              content: `Generate keywords for the theme: "${theme}"`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (
        response.data &&
        response.data.result &&
        response.data.result.response
      ) {
        logger.debug(
          { videoId, keywords: response.data.result.response },
          "Received keywords from Cloudflare AI",
        );
        const keywordsText = response.data.result.response;
        return keywordsText
          .split(",")
          .map((k: string) => k.trim())
          .filter((k: string) => k.length > 0);
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare AI API for keywords",
        );
        return [];
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error generating keywords with Cloudflare AI",
      );
      return [];
    }
  }

  public async analyzeSentiment(
    text: string,
    videoId: string,
  ): Promise<string> {
    if (!this.apiKey || !this.accountId) {
      logger.error(
        "Cloudflare AI credentials not set. Cannot analyze sentiment.",
      );
      return "neutral";
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Cloudflare Workers AI for sentiment analysis",
      );
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
        {
          messages: [
            {
              role: "system",
              content:
                "You are an expert in sentiment analysis. Analyze the sentiment of the following text and return 'positive', 'negative', or 'neutral'.",
            },
            {
              role: "user",
              content: `Analyze the sentiment of: "${text}"`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (
        response.data &&
        response.data.result &&
        response.data.result.response
      ) {
        logger.debug(
          { videoId, sentiment: response.data.result.response },
          "Received sentiment analysis from Cloudflare AI",
        );
        const sentiment = response.data.result.response.toLowerCase();
        if (sentiment.includes("positive")) return "positive";
        if (sentiment.includes("negative")) return "negative";
        return "neutral";
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare AI API for sentiment analysis",
        );
        return "neutral";
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error analyzing sentiment with Cloudflare AI",
      );
      return "neutral";
    }
  }

  public async generateVideoMetadata(
    videoContent: string,
    videoId: string,
  ): Promise<{
    title: string;
    description: string;
    tags: string[];
    hashtags: string[];
  }> {
    if (!this.apiKey || !this.accountId) {
      logger.error(
        "Cloudflare AI credentials not set. Cannot generate video metadata.",
      );
      return { title: "", description: "", tags: [], hashtags: [] };
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Cloudflare Workers AI for video metadata generation",
      );
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`,
        {
          messages: [
            {
              role: "system",
              content:
                "You are an expert in creating engaging video metadata. Generate a title, description, tags, and hashtags for a short video based on its content.",
            },
            {
              role: "user",
              content: `Generate metadata for a video with the following content: "${videoContent}"`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (
        response.data &&
        response.data.result &&
        response.data.result.response
      ) {
        logger.debug(
          { videoId, metadata: response.data.result.response },
          "Received video metadata from Cloudflare AI",
        );
        const metadataText = response.data.result.response;
        const lines = metadataText
          .split("\n")
          .filter((line: string) => line.trim().length > 0);
        let title = "";
        let description = "";
        let tags: string[] = [];
        let hashtags: string[] = [];

        for (const line of lines) {
          if (line.toLowerCase().startsWith("title:")) {
            title = line.split(":")[1].trim();
          } else if (line.toLowerCase().startsWith("description:")) {
            description = line.split(":")[1].trim();
          } else if (line.toLowerCase().startsWith("tags:")) {
            tags = line
              .split(":")[1]
              .split(",")
              .map((t: string) => t.trim())
              .filter((t: string) => t.length > 0);
          } else if (line.toLowerCase().startsWith("hashtags:")) {
            hashtags = line
              .split(":")[1]
              .split(",")
              .map((h: string) => h.trim())
              .filter((h: string) => h.length > 0);
          }
        }

        return { title, description, tags, hashtags };
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare AI API for video metadata",
        );
        return { title: "", description: "", tags: [], hashtags: [] };
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error generating video metadata with Cloudflare AI",
      );
      return { title: "", description: "", tags: [], hashtags: [] };
    }
  }

  public async generateThumbnail(
    videoContent: string,
    videoId: string,
  ): Promise<string> {
    if (!this.apiKey || !this.accountId) {
      logger.error(
        "Cloudflare AI credentials not set. Cannot generate thumbnail.",
      );
      return "";
    }

    try {
      logger.info(
        { videoId },
        "Sending request to Cloudflare Workers AI for thumbnail generation with Stable Diffusion",
      );
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
        {
          prompt: `Generate a high-quality thumbnail image for a video with content: ${videoContent}`,
          num_steps: 20,
          image_dimensions: "512x512",
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
        },
      );

      if (response.data) {
        logger.debug(
          { videoId },
          "Received thumbnail data from Cloudflare AI Stable Diffusion",
        );
        return Buffer.from(response.data).toString("base64");
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare AI API for thumbnail generation",
        );
        return "";
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId },
        "Error generating thumbnail with Cloudflare AI Stable Diffusion",
      );
      return "";
    }
  }

  public async generateVisual(
    prompt: string,
    videoId: string,
    sceneIndex: number,
  ): Promise<string> {
    if (!this.apiKey || !this.accountId) {
      logger.error(
        "Cloudflare AI credentials not set. Cannot generate visual.",
      );
      return "";
    }

    try {
      logger.info(
        { videoId, sceneIndex },
        "Sending request to Cloudflare Workers AI for visual generation with Stable Diffusion",
      );
      const response = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
        {
          prompt: `Generate a high-quality image for a video scene: ${prompt}`,
          num_steps: 20,
          image_dimensions: "512x512",
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          responseType: "arraybuffer",
        },
      );

      if (response.data) {
        logger.debug(
          { videoId, sceneIndex },
          "Received visual data from Cloudflare AI Stable Diffusion",
        );
        return Buffer.from(response.data).toString("base64");
      } else {
        logger.error(
          { response },
          "Unexpected response format from Cloudflare AI API for visual generation",
        );
        return "";
      }
    } catch (error: unknown) {
      logger.error(
        { error, videoId, sceneIndex },
        "Error generating visual with Cloudflare AI Stable Diffusion",
      );
      return "";
    }
  }
}





