import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "path";
import { ScriptTemplateEngine, ContentType, Platform, type ScriptTemplate, type ScriptGenerationRequest } from "../ScriptTemplateEngine";

describe("ScriptTemplateEngine", () => {
  let engine: ScriptTemplateEngine;
  let testTemplatesDir: string;
  let testTemplate: ScriptTemplate;

  beforeEach(async () => {
    // Create temporary templates directory
    testTemplatesDir = path.join(__dirname, "temp-templates");
    await fs.ensureDir(testTemplatesDir);

    testTemplate = {
      id: "test_template",
      name: "Test Template",
      contentType: ContentType.EDUCATIONAL,
      description: "A test template for unit tests",
      template: "Hello {name}! Today we'll learn about {topic}. First, {step1}. Then, {step2}. {conclusion}.",
      variables: [
        {
          name: "name",
          type: "string",
          required: true,
          description: "User's name"
        },
        {
          name: "topic",
          type: "string",
          required: true,
          description: "Topic to learn about"
        },
        {
          name: "step1",
          type: "string",
          required: true,
          description: "First step"
        },
        {
          name: "step2",
          type: "string",
          required: true,
          description: "Second step"
        },
        {
          name: "conclusion",
          type: "string",
          required: false,
          description: "Conclusion statement",
          defaultValue: "That's all for today!"
        }
      ],
      hooks: [
        {
          position: "opening",
          text: "Hello {name}!",
          purpose: "greeting"
        },
        {
          position: "closing",
          text: "{conclusion}",
          purpose: "wrap_up"
        }
      ],
      idealLength: {
        min: 30,
        max: 60
      },
      recommendedSettings: {
        voice: "af_heart",
        music: "hopeful",
        orientation: "portrait"
      },
      tags: ["test", "education", "tutorial"]
    };

    // Save test template
    await fs.writeJson(path.join(testTemplatesDir, "test_template.json"), testTemplate);

    engine = new ScriptTemplateEngine(testTemplatesDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.remove(testTemplatesDir);
  });

  describe("Template Management", () => {
    it("should load templates from directory", async () => {
      const templates = engine.getTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe("test_template");
    });

    it("should get template by id", () => {
      const template = engine.getTemplate("test_template");
      expect(template).toBeDefined();
      expect(template?.name).toBe("Test Template");
    });

    it("should return undefined for non-existent template", () => {
      const template = engine.getTemplate("non_existent");
      expect(template).toBeUndefined();
    });

    it("should filter templates by content type", () => {
      const educationalTemplates = engine.getTemplatesByType(ContentType.EDUCATIONAL);
      expect(educationalTemplates).toHaveLength(1);
      expect(educationalTemplates[0].contentType).toBe(ContentType.EDUCATIONAL);

      const entertainmentTemplates = engine.getTemplatesByType(ContentType.ENTERTAINMENT);
      expect(entertainmentTemplates).toHaveLength(0);
    });

    it("should filter templates by platform", async () => {
      const allPlatformTemplates = engine.getTemplatesByPlatform(Platform.TIKTOK);
      expect(allPlatformTemplates).toHaveLength(1); // Template has no specific platform

      // Add platform-specific template
      const platformTemplate = { ...testTemplate, id: "tiktok_template", platform: Platform.TIKTOK };
      await fs.writeJson(path.join(testTemplatesDir, "tiktok_template.json"), platformTemplate);
      
      // Reload templates
      const newEngine = new ScriptTemplateEngine(testTemplatesDir);
      const tiktokTemplates = newEngine.getTemplatesByPlatform(Platform.TIKTOK);
      expect(tiktokTemplates.length).toBeGreaterThanOrEqual(1);
    });

    it("should search templates by query", () => {
      const results = engine.searchTemplates("test");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("test_template");

      const noResults = engine.searchTemplates("nonexistent");
      expect(noResults).toHaveLength(0);
    });

    it("should add new template", async () => {
      const newTemplate: ScriptTemplate = {
        id: "new_template",
        name: "New Template",
        contentType: ContentType.ENTERTAINMENT,
        description: "A new test template",
        template: "This is a new template with {variable}.",
        variables: [
          {
            name: "variable",
            type: "string",
            required: true,
            description: "Test variable"
          }
        ],
        hooks: [],
        idealLength: { min: 15, max: 30 },
        recommendedSettings: {},
        tags: ["new", "test"]
      };

      await engine.addTemplate(newTemplate);
      const templates = engine.getTemplates();
      expect(templates).toHaveLength(2);
      expect(engine.getTemplate("new_template")).toBeDefined();
    });

    it("should remove template", async () => {
      const success = await engine.removeTemplate("test_template");
      expect(success).toBe(true);
      
      const templates = engine.getTemplates();
      expect(templates).toHaveLength(0);
      expect(engine.getTemplate("test_template")).toBeUndefined();
    });
  });

  describe("Script Generation", () => {
    it("should generate script with all required variables", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_template",
        variables: {
          name: "Alice",
          topic: "JavaScript",
          step1: "understand variables",
          step2: "learn functions"
        }
      };

      const script = await engine.generateScript(request);
      
      expect(script.id).toBeDefined();
      expect(script.templateId).toBe("test_template");
      expect(script.content.fullScript).toContain("Hello Alice!");
      expect(script.content.fullScript).toContain("JavaScript");
      expect(script.content.fullScript).toContain("understand variables");
      expect(script.content.fullScript).toContain("learn functions");
      expect(script.content.fullScript).toContain("That's all for today!"); // default value
    });

    it("should throw error for missing required variables", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_template",
        variables: {
          name: "Alice"
          // Missing required variables: topic, step1, step2
        }
      };

      await expect(engine.generateScript(request)).rejects.toThrow("Missing required variables");
    });

    it("should throw error for non-existent template", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "non_existent",
        variables: {}
      };

      await expect(engine.generateScript(request)).rejects.toThrow("Template not found");
    });

    it("should calculate estimated duration correctly", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_template",
        variables: {
          name: "Alice",
          topic: "JavaScript basics for beginners",
          step1: "understand variables and data types",
          step2: "learn about functions and scope"
        }
      };

      const script = await engine.generateScript(request);
      
      // Should have reasonable duration based on word count (150 words per minute)
      expect(script.content.estimatedDuration).toBeGreaterThan(0);
      expect(script.content.wordCount).toBeGreaterThan(0);
    });

    it("should generate scenes from script", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_template",
        variables: {
          name: "Alice",
          topic: "cooking",
          step1: "prepare ingredients",
          step2: "follow the recipe"
        }
      };

      const script = await engine.generateScript(request);
      
      expect(script.content.scenes).toBeDefined();
      expect(script.content.scenes.length).toBeGreaterThan(0);
      
      // Check scene structure
      const firstScene = script.content.scenes[0];
      expect(firstScene.text).toBeDefined();
      expect(firstScene.searchTerms).toBeDefined();
      expect(firstScene.searchTerms.length).toBeGreaterThan(0);
      expect(firstScene.duration).toBeGreaterThan(0);
    });

    it("should optimize for target length", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_template",
        variables: {
          name: "Alice",
          topic: "quick tips",
          step1: "tip one",
          step2: "tip two"
        },
        targetLength: 30
      };

      const script = await engine.generateScript(request);
      
      // Should attempt to optimize for 30 seconds
      expect(Math.abs(script.content.estimatedDuration - 30)).toBeLessThan(10);
    });

    it("should apply platform optimizations", async () => {
      const request: ScriptGenerationRequest = {
        templateId: "test_template",
        variables: {
          name: "Alice",
          topic: "viral content",
          step1: "hook viewers",
          step2: "engage audience"
        },
        platform: Platform.TIKTOK
      };

      const script = await engine.generateScript(request);
      
      expect(script.platform).toBe(Platform.TIKTOK);
      // Platform optimizations should be applied to the template
    });
  });

  describe("Variable Interpolation", () => {
    it("should handle simple variable replacement", () => {
      const template = "Hello {name}, welcome to {place}!";
      const variables = { name: "Alice", place: "the tutorial" };
      
      // Access private method for testing
      const result = (engine as any).interpolateTemplate(template, variables);
      expect(result).toBe("Hello Alice, welcome to the tutorial!");
    });

    it("should handle array variables", () => {
      const template = "Items: {items.join:, } and first item is {items[0]}";
      const variables = { items: ["apple", "banana", "cherry"] };
      
      const result = (engine as any).interpolateTemplate(template, variables);
      expect(result).toBe("Items: apple, banana, cherry and first item is apple");
    });

    it("should handle default separators for arrays", () => {
      const template = "List: {tags.join}";
      const variables = { tags: ["tag1", "tag2", "tag3"] };
      
      const result = (engine as any).interpolateTemplate(template, variables);
      expect(result).toBe("List: tag1, tag2, tag3");
    });

    it("should handle missing variables gracefully", () => {
      const template = "Hello {name}, age is {age}";
      const variables = { name: "Alice" };
      
      const result = (engine as any).interpolateTemplate(template, variables);
      expect(result).toBe("Hello Alice, age is {age}"); // Unmatched variables remain
    });
  });

  describe("Search Terms Generation", () => {
    it("should generate appropriate search terms for educational content", () => {
      const text = "Learn how to cook delicious pasta at home";
      const searchTerms = (engine as any).generateSearchTerms(text, ContentType.EDUCATIONAL);
      
      expect(searchTerms).toContain("learning");
      expect(searchTerms).toContain("education");
      expect(searchTerms).toContain("tutorial");
      expect(searchTerms.length).toBeGreaterThan(3);
    });

    it("should generate different search terms for entertainment content", () => {
      const text = "This funny story will make you laugh";
      const searchTerms = (engine as any).generateSearchTerms(text, ContentType.ENTERTAINMENT);
      
      expect(searchTerms).toContain("fun");
      expect(searchTerms).toContain("entertainment");
      expect(searchTerms).toContain("engaging");
    });
  });

  describe("Scene Optimization", () => {
    it("should shorten scenes when over target length", () => {
      const scenes = [
        { text: "Scene 1", searchTerms: ["test"], duration: 20, emphasis: "low" as const },
        { text: "Scene 2", searchTerms: ["test"], duration: 25, emphasis: "high" as const },
        { text: "Scene 3", searchTerms: ["test"], duration: 30, emphasis: "medium" as const }
      ];

      const optimized = (engine as any).optimizeForLength(scenes, 45);
      
      // Should remove low emphasis scenes first
      expect(optimized.length).toBeLessThan(scenes.length);
      expect(optimized.some((s: any) => s.emphasis === "high")).toBe(true);
    });

    it("should lengthen scenes when under target length", () => {
      const scenes = [
        { text: "Scene 1", searchTerms: ["test"], duration: 10, emphasis: "high" as const },
        { text: "Scene 2", searchTerms: ["test"], duration: 10, emphasis: "medium" as const }
      ];

      const optimized = (engine as any).optimizeForLength(scenes, 30);
      
      const totalDuration = optimized.reduce((sum: number, scene: any) => sum + scene.duration, 0);
      expect(totalDuration).toBeCloseTo(30, 1);
    });
  });

  describe("Error Handling", () => {
    it("should handle template loading errors gracefully", async () => {
      // Create invalid JSON file
      const invalidPath = path.join(testTemplatesDir, "invalid.json");
      await fs.writeFile(invalidPath, "invalid json content");

      // Should not crash, just log error and continue
      const newEngine = new ScriptTemplateEngine(testTemplatesDir);
      const templates = newEngine.getTemplates();
      
      // Should still load valid templates
      expect(templates.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle missing templates directory", () => {
      const nonExistentDir = path.join(__dirname, "non-existent");
      
      // Should not crash
      expect(() => new ScriptTemplateEngine(nonExistentDir)).not.toThrow();
    });
  });
});