import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import { ScriptGenerationService } from "../ScriptGenerationService";
import type { ScriptGenerationRequest, ScriptTemplate } from "../ScriptTemplateEngine";

describe("ScriptGenerationService", () => {
  let service: ScriptGenerationService;
  let testTemplatesDir: string;

  beforeEach(async () => {
    // Create temporary templates directory with test templates
    testTemplatesDir = path.join(__dirname, "temp-service-templates");
    await fs.ensureDir(testTemplatesDir);

    const testTemplate: ScriptTemplate = {
      id: "test_service_template",
      name: "Test Service Template",
      contentType: "educational",
      description: "A test template for the service",
      template: "Learn how to {topic} in {duration}. First, {step1}. Then, {step2}. {conclusion}",
      variables: [
        { name: "topic", type: "string", required: true, description: "Topic to learn" },
        { name: "duration", type: "string", required: true, description: "Time duration" },
        { name: "step1", type: "string", required: true, description: "First step" },
        { name: "step2", type: "string", required: true, description: "Second step" },
        { name: "conclusion", type: "string", required: false, description: "Conclusion", defaultValue: "That's it!" }
      ],
      hooks: [
        { position: "opening", text: "Learn how to {topic}", purpose: "hook" },
        { position: "closing", text: "{conclusion}", purpose: "wrap_up" }
      ],
      idealLength: { min: 30, max: 60 },
      recommendedSettings: { voice: "af_heart", music: "hopeful", orientation: "portrait" },
      tags: ["education", "tutorial", "service-test"]
    };

    await fs.writeJson(path.join(testTemplatesDir, "test_service_template.json"), testTemplate);
    
    service = new ScriptGenerationService(testTemplatesDir);
  });

  afterEach(async () => {
    await fs.remove(testTemplatesDir);
  });

  describe("Template Access", () => {
    it("should get all templates", () => {
      const templates = service.getTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe("test_service_template");
    });

    it("should get templates by type", () => {
      const eduTemplates = service.getTemplatesByType("educational");
      expect(eduTemplates).toHaveLength(1);
      
      const entTemplates = service.getTemplatesByType("entertainment");
      expect(entTemplates).toHaveLength(0);
    });

    it("should get templates by platform", () => {
      const allTemplates = service.getTemplatesByPlatform("tiktok");
      expect(allTemplates).toHaveLength(1); // No specific platform
    });

    it("should search templates", () => {
      const results = service.searchTemplates("tutorial");
      expect(results).toHaveLength(1);
      
      const noResults = service.searchTemplates("nonexistent");
      expect(noResults).toHaveLength(0);
    });

    it("should get specific template", () => {
      const template = service.getTemplate("test_service_template");
      expect(template).toBeDefined();
      expect(template?.name).toBe("Test Service Template");
    });
  });

  describe("Script Generation and Scene Conversion", () => {
    it("should generate script and convert to scenes", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "JavaScript",
          duration: "10 minutes",
          step1: "understand variables",
          step2: "learn functions"
        }
      };

      const result = await service.generateScriptAndScenes(request);
      
      expect(result.script).toBeDefined();
      expect(result.scenes).toBeDefined();
      expect(result.validation).toBeDefined();
      
      // Check script content
      expect(result.script.content.fullScript).toContain("JavaScript");
      expect(result.script.content.scenes.length).toBeGreaterThan(0);
      
      // Check converted scenes
      expect(result.scenes.length).toBeGreaterThan(0);
      result.scenes.forEach(scene => {
        expect(scene.text).toBeDefined();
        expect(scene.searchTerms).toBeDefined();
        expect(scene.searchTerms.length).toBeGreaterThan(0);
      });
    });

    it("should optimize search terms", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "cooking pasta",
          duration: "5 minutes", 
          step1: "boil water",
          step2: "add salt"
        }
      };

      const result = await service.generateScriptAndScenes(request, {
        optimizeSearchTerms: true
      });

      // Should have educational search terms added
      const allSearchTerms = result.scenes.flatMap(scene => scene.searchTerms);
      expect(allSearchTerms).toContain("learning");
      expect(allSearchTerms).toContain("education");
    });

    it("should extract visual cues from text", () => {
      const text = "Watch as I demonstrate this beautiful technique. See how it works!";
      const cues = (service as any).extractVisualCues(text);
      
      expect(cues).toContain("watch");
      expect(cues).toContain("see");
      expect(cues).toContain("beautiful");
    });

    it("should limit scenes when maxScenes is specified", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "complex cooking process with many detailed steps",
          duration: "20 minutes",
          step1: "step one with lots of detail",
          step2: "step two with even more explanation"
        }
      };

      const result = await service.generateScriptAndScenes(request, {
        maxScenes: 3
      });

      expect(result.scenes.length).toBeLessThanOrEqual(3);
    });

    it("should adjust scene durations within constraints", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "quick tip",
          duration: "30 seconds",
          step1: "do this",
          step2: "then that"
        }
      };

      const result = await service.generateScriptAndScenes(request, {
        minSceneDuration: 4,
        maxSceneDuration: 8
      });

      result.scenes.forEach(scene => {
        expect(scene.duration).toBeGreaterThanOrEqual(4);
        expect(scene.duration).toBeLessThanOrEqual(8);
      });
    });
  });

  describe("Prompt to Scenes Generation", () => {
    it("should generate scenes from simple prompt", async () => {
      const prompt = "Teach me how to cook pasta quickly";

      const result = await service.generateScenesFromPrompt(prompt, {
        contentType: "educational",
        targetDuration: 45
      });

      expect(result.scenes).toBeDefined();
      expect(result.scenes.length).toBeGreaterThan(0);
      expect(result.selectedTemplate).toBeDefined();
      expect(result.script).toBeDefined();
      
      // Should contain relevant content
      expect(result.script.content.fullScript.toLowerCase()).toContain("cook");
    });

    it("should select appropriate template based on prompt", () => {
      const educationalPrompt = "How to learn JavaScript tutorial guide";
      const template = (service as any).selectTemplateFromPrompt(educationalPrompt, {
        contentType: "educational"
      });

      expect(template).toBeDefined();
      expect(template.contentType).toBe("educational");
    });

    it("should extract variables from prompt", () => {
      const prompt = "Learn how to cook delicious Italian pasta in 15 minutes";
      const template = service.getTemplate("test_service_template");
      
      if (template) {
        const variables = (service as any).extractVariablesFromPrompt(prompt, template);
        expect(variables).toBeDefined();
        expect(typeof variables.topic).toBe("string");
        expect(typeof variables.duration).toBe("string");
      }
    });

    it("should handle prompts with no matching template", async () => {
      const obscurePrompt = "xyzzyx nonexistent topic that matches nothing";

      await expect(
        service.generateScenesFromPrompt(obscurePrompt)
      ).rejects.toThrow("Could not find suitable template");
    });
  });

  describe("Variable Extraction from Prompts", () => {
    it("should extract main topic from how-to prompts", () => {
      const prompt = "How to bake chocolate cookies";
      const topic = (service as any).extractMainTopic(prompt);
      expect(topic).toBe("bake chocolate cookies");
    });

    it("should extract questions from prompts", () => {
      const prompt = "What is the best way to learn programming?";
      const question = (service as any).extractQuestion(prompt);
      expect(question).toBe("What is the best way to learn programming?");
    });

    it("should extract time references", () => {
      const prompt = "Yesterday I learned something amazing";
      const timeRef = (service as any).extractTimeReference(prompt);
      expect(timeRef).toBe("yesterday");
    });

    it("should extract product names", () => {
      const prompt = "Review of the Amazing Product Pro Max";
      const productName = (service as any).extractProductName(prompt);
      expect(productName).toBe("Amazing Product Pro Max");
    });

    it("should extract numbers from prompts", () => {
      const prompt = "5 tips for better coding";
      const number = (service as any).extractNumber(prompt);
      expect(number).toBe("5");
    });

    it("should handle prompts without specific patterns", () => {
      const prompt = "generic content without specific patterns";
      const topic = (service as any).extractMainTopic(prompt);
      expect(topic).toBe("this topic"); // fallback
    });
  });

  describe("Template Scoring for Prompt Selection", () => {
    it("should score templates based on keyword matches", () => {
      const templates = [
        {
          id: "educational_template",
          contentType: "educational",
          name: "Educational Template",
          tags: ["education", "tutorial", "learning"],
        },
        {
          id: "entertainment_template", 
          contentType: "entertainment",
          name: "Entertainment Template",
          tags: ["funny", "story", "entertainment"],
        }
      ];

      const educationalPrompt = "tutorial about learning programming";
      
      // Mock the getTemplates method
      const originalGetTemplates = service.getTemplates;
      (service as any).getTemplates = () => templates;

      const selectedTemplate = (service as any).selectTemplateFromPrompt(educationalPrompt, {});
      
      expect(selectedTemplate).toBeDefined();
      expect(selectedTemplate.contentType).toBe("educational");

      // Restore original method
      (service as any).getTemplates = originalGetTemplates;
    });
  });

  describe("Error Handling", () => {
    it("should handle template not found errors", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "nonexistent_template",
        variables: {}
      };

      await expect(
        service.generateScriptAndScenes(request)
      ).rejects.toThrow("Template not found");
    });

    it("should handle missing required variables", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "JavaScript"
          // Missing required variables
        }
      };

      await expect(
        service.generateScriptAndScenes(request)
      ).rejects.toThrow("Missing required variables");
    });
  });

  describe("Scene Enhancement Features", () => {
    it("should add visual cues to scenes", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "amazing visual techniques",
          duration: "5 minutes",
          step1: "watch this demonstration",
          step2: "see the beautiful results"
        }
      };

      const result = await service.generateScriptAndScenes(request);
      
      const scenesWithVisualCues = result.scenes.filter(scene => 
        scene.visualCues && scene.visualCues.length > 0
      );
      
      expect(scenesWithVisualCues.length).toBeGreaterThan(0);
    });

    it("should preserve emphasis levels", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "important concepts",
          duration: "5 minutes",
          step1: "crucial first step",
          step2: "essential second step"
        }
      };

      const result = await service.generateScriptAndScenes(request);
      
      const emphasisLevels = result.scenes.map(scene => scene.emphasis);
      expect(emphasisLevels).toContain("high");
    });

    it("should generate appropriate search terms for different content types", () => {
      // Educational content
      const eduTerms = (service as any).optimizeSearchTerms(
        { text: "Learn programming basics", searchTerms: ["programming"] },
        { contentType: "educational" }
      );
      expect(eduTerms).toContain("learning");

      // Entertainment content  
      const entTerms = (service as any).optimizeSearchTerms(
        { text: "Funny story time", searchTerms: ["story"] },
        { contentType: "entertainment" }
      );
      expect(entTerms).toContain("fun");
    });
  });

  describe("Validation Integration", () => {
    it("should include validation results", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "JavaScript fundamentals",
          duration: "10 minutes",
          step1: "understand variables and data types",
          step2: "practice with functions and scope"
        }
      };

      const result = await service.generateScriptAndScenes(request);
      
      expect(result.validation).toBeDefined();
      expect(result.validation.isValid).toBeDefined();
      expect(result.validation.score).toBeDefined();
      expect(result.validation.engagementMetrics).toBeDefined();
      
      // Check engagement metrics structure
      const metrics = result.validation.engagementMetrics;
      expect(metrics.hookStrength).toBeDefined();
      expect(metrics.pacing).toBeDefined();
      expect(metrics.clarity).toBeDefined();
    });

    it("should provide validation recommendations", async () => {
      const poorRequest: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "something", 
          duration: "forever",
          step1: "do stuff",
          step2: "more stuff"
        }
      };

      const result = await service.generateScriptAndScenes(poorRequest);
      
      if (result.validation.recommendations.length > 0) {
        expect(result.validation.recommendations).toBeDefined();
        expect(Array.isArray(result.validation.recommendations)).toBe(true);
      }
    });
  });

  describe("Configuration Options", () => {
    it("should handle different scene conversion options", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_service_template",
        variables: {
          topic: "advanced techniques",
          duration: "15 minutes",
          step1: "master the basics first",
          step2: "then apply advanced concepts"
        }
      };

      const result = await service.generateScriptAndScenes(request, {
        maxScenes: 5,
        minSceneDuration: 3,
        maxSceneDuration: 10,
        optimizeSearchTerms: true
      });

      expect(result.scenes.length).toBeLessThanOrEqual(5);
      result.scenes.forEach(scene => {
        expect(scene.duration).toBeGreaterThanOrEqual(3);
        expect(scene.duration).toBeLessThanOrEqual(10);
      });
    });
  });
});