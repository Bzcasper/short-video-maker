import { describe, it, expect, beforeEach } from "vitest";
import { ContentValidator } from "../ContentValidator";
import { ScriptTemplateEngine, Platform, ContentType, type GeneratedScript } from "../ScriptTemplateEngine";

describe("ContentValidator", () => {
  let validator: ContentValidator;
  let mockScript: GeneratedScript;

  beforeEach(() => {
    validator = new ContentValidator();
    
    mockScript = {
      id: "test_script_123",
      templateId: "test_template",
      platform: Platform.TIKTOK,
      content: {
        fullScript: "Did you know this amazing fact? Today I'm going to show you exactly how to master cooking in just 5 minutes. First, gather your ingredients. This is crucial because preparation is key. Finally, follow my technique. Try this out and let me know how it worked!",
        scenes: [
          {
            text: "Did you know this amazing fact?",
            searchTerms: ["cooking", "food", "tutorial"],
            duration: 3,
            hook: {
              position: "opening",
              text: "Did you know this amazing fact?",
              purpose: "curiosity_gap"
            },
            emphasis: "high"
          },
          {
            text: "Today I'm going to show you exactly how to master cooking in just 5 minutes.",
            searchTerms: ["cooking", "tutorial", "education"],
            duration: 4,
            emphasis: "high"
          },
          {
            text: "First, gather your ingredients. This is crucial because preparation is key.",
            searchTerms: ["ingredients", "preparation", "cooking"],
            duration: 5,
            emphasis: "medium"
          },
          {
            text: "Finally, follow my technique.",
            searchTerms: ["technique", "cooking", "method"],
            duration: 3,
            emphasis: "medium"
          },
          {
            text: "Try this out and let me know how it worked!",
            searchTerms: ["feedback", "comment", "engagement"],
            duration: 3,
            hook: {
              position: "closing",
              text: "Try this out and let me know how it worked!",
              purpose: "call_to_action"
            },
            emphasis: "high"
          }
        ],
        estimatedDuration: 18,
        wordCount: 45
      },
      metadata: {
        createdAt: new Date(),
        variables: {
          main_topic: "cooking",
          hook_question: "this amazing fact"
        },
        template: "Educational How-To Template"
      },
      validation: {
        isValid: true,
        score: 0,
        issues: [],
        recommendations: []
      }
    };
  });

  describe("Script Validation", () => {
    it("should validate a well-structured script", async () => {
      const validatedScript = await validator.validateScript(mockScript);
      
      expect(validatedScript.validation.score).toBeGreaterThan(60);
      expect(validatedScript.validation.isValid).toBe(true);
      expect(validatedScript.validation.issues).toHaveLength(0);
    });

    it("should flag scripts with poor engagement hooks", async () => {
      const poorScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          scenes: [
            {
              text: "Hello everyone.",
              searchTerms: ["generic"],
              duration: 2,
              emphasis: "low" as const
            },
            ...mockScript.content.scenes.slice(1)
          ]
        }
      };

      const validatedScript = await validator.validateScript(poorScript);
      expect(validatedScript.validation.score).toBeLessThan(mockScript.validation.score || 80);
    });

    it("should handle scripts that are too long", async () => {
      const longScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          estimatedDuration: 120, // 2 minutes
          fullScript: "This is a very long script that goes on and on for way too long and exceeds the ideal length for the platform and will likely lose viewer attention before the end because it's just too lengthy for short-form content."
        }
      };

      const validatedScript = await validator.validateScript(longScript);
      expect(validatedScript.validation.issues.some(issue => 
        issue.includes("too long")
      )).toBe(true);
    });

    it("should handle scripts that are too short", async () => {
      const shortScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          estimatedDuration: 5, // 5 seconds
          fullScript: "Quick tip.",
          scenes: [{
            text: "Quick tip.",
            searchTerms: ["tip"],
            duration: 5,
            emphasis: "medium" as const
          }]
        }
      };

      const validatedScript = await validator.validateScript(shortScript);
      expect(validatedScript.validation.issues.some(issue => 
        issue.includes("too short")
      )).toBe(true);
    });
  });

  describe("Engagement Hook Validation", () => {
    it("should recognize strong engagement hooks", async () => {
      const hookScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          scenes: [
            {
              text: "What if I told you this secret will change everything?",
              searchTerms: ["secret", "amazing"],
              duration: 3,
              hook: {
                position: "opening" as const,
                text: "What if I told you this secret will change everything?",
                purpose: "curiosity_gap"
              },
              emphasis: "high" as const
            },
            ...mockScript.content.scenes.slice(1)
          ]
        }
      };

      const result = (validator as any).validateEngagementHooks(hookScript);
      expect(result.score).toBeGreaterThan(70);
      expect(result.passed).toBe(true);
    });

    it("should flag weak opening hooks", async () => {
      const weakScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          scenes: [
            {
              text: "Hi, today I will talk about something.",
              searchTerms: ["talk"],
              duration: 8, // Too long for hook
              emphasis: "low" as const
            },
            ...mockScript.content.scenes.slice(1)
          ]
        }
      };

      const result = (validator as any).validateEngagementHooks(weakScript);
      expect(result.score).toBeLessThan(60);
      expect(result.passed).toBe(false);
    });
  });

  describe("Pacing Validation", () => {
    it("should validate good pacing with consistent scene lengths", async () => {
      const goodPacingScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          scenes: [
            { text: "Scene 1", searchTerms: ["test"], duration: 4, emphasis: "high" as const },
            { text: "Scene 2", searchTerms: ["test"], duration: 5, emphasis: "medium" as const },
            { text: "Scene 3", searchTerms: ["test"], duration: 4, emphasis: "medium" as const },
            { text: "Scene 4", searchTerms: ["test"], duration: 5, emphasis: "high" as const }
          ]
        }
      };

      const result = (validator as any).validatePacing(goodPacingScript);
      expect(result.score).toBeGreaterThan(70);
      expect(result.passed).toBe(true);
    });

    it("should flag inconsistent pacing", async () => {
      const badPacingScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          scenes: [
            { text: "Very short", searchTerms: ["test"], duration: 1, emphasis: "high" as const },
            { text: "This is a much longer scene that goes on and on", searchTerms: ["test"], duration: 15, emphasis: "low" as const },
            { text: "Another short one", searchTerms: ["test"], duration: 2, emphasis: "medium" as const }
          ]
        }
      };

      const result = (validator as any).validatePacing(badPacingScript);
      expect(result.score).toBeLessThan(70);
      expect(result.passed).toBe(false);
    });
  });

  describe("Clarity Validation", () => {
    it("should validate clear, simple language", async () => {
      const clearScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          fullScript: "This is easy to read. Short sentences work well. Simple words help everyone understand.",
          wordCount: 15
        }
      };

      const result = (validator as any).validateClarity(clearScript);
      expect(result.score).toBeGreaterThan(75);
      expect(result.passed).toBe(true);
    });

    it("should flag overly complex language", async () => {
      const complexScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          fullScript: "We must utilize sophisticated methodologies to facilitate the implementation of comprehensive optimization strategies that will leverage synergistic opportunities for maximizing engagement metrics.",
          wordCount: 23
        }
      };

      const result = (validator as any).validateClarity(complexScript);
      expect(result.score).toBeLessThan(75);
      expect(result.suggestion).toContain("simplify");
    });
  });

  describe("Call-to-Action Validation", () => {
    it("should recognize effective CTAs", async () => {
      const ctaScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          fullScript: "Learn this technique today. Subscribe for more tips. Let me know what you think in the comments!",
          scenes: [
            ...mockScript.content.scenes.slice(0, -1),
            {
              text: "Subscribe for more tips and let me know what you think!",
              searchTerms: ["subscribe", "comment"],
              duration: 3,
              hook: {
                position: "closing" as const,
                text: "Subscribe for more tips and let me know what you think!",
                purpose: "call_to_action"
              },
              emphasis: "high" as const
            }
          ]
        }
      };

      const result = (validator as any).validateCallToAction(ctaScript);
      expect(result.score).toBeGreaterThan(60);
      expect(result.passed).toBe(true);
    });

    it("should flag missing CTAs", async () => {
      const noctaScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          fullScript: "Here's some information about cooking. That's all.",
          scenes: [{
            text: "That's all.",
            searchTerms: ["end"],
            duration: 2,
            emphasis: "low" as const
          }]
        }
      };

      const result = (validator as any).validateCallToAction(noctaScript);
      expect(result.score).toBeLessThan(60);
      expect(result.passed).toBe(false);
    });
  });

  describe("Platform Optimization", () => {
    it("should validate TikTok optimizations", async () => {
      const tiktokScript = {
        ...mockScript,
        platform: Platform.TIKTOK,
        content: {
          ...mockScript.content,
          estimatedDuration: 30, // Under 60 seconds
          scenes: [
            {
              text: "Amazing viral trend alert!",
              searchTerms: ["viral", "trending"],
              duration: 2, // Quick hook
              emphasis: "high" as const
            },
            ...mockScript.content.scenes.slice(1)
          ]
        }
      };

      const result = (validator as any).validatePlatformOptimization(tiktokScript);
      expect(result.score).toBeGreaterThan(70);
      expect(result.passed).toBe(true);
    });

    it("should flag poor platform optimization", async () => {
      const poorScript = {
        ...mockScript,
        platform: Platform.TIKTOK,
        content: {
          ...mockScript.content,
          estimatedDuration: 120, // Over 60 seconds - penalty
          scenes: [
            {
              text: "Let me slowly introduce today's topic in a very detailed manner.",
              searchTerms: ["slow"],
              duration: 8, // Slow start - penalty
              emphasis: "low" as const
            }
          ]
        }
      };

      const result = (validator as any).validatePlatformOptimization(poorScript);
      expect(result.score).toBeLessThan(70);
      expect(result.passed).toBe(false);
    });

    it("should handle scripts without platform specification", async () => {
      const noPlatformScript = {
        ...mockScript,
        platform: undefined
      };

      const result = (validator as any).validatePlatformOptimization(noPlatformScript);
      expect(result.score).toBe(80); // Neutral score
      expect(result.passed).toBe(true);
    });
  });

  describe("Content Safety", () => {
    it("should pass safe content", async () => {
      const safeScript = mockScript;
      const result = await (validator as any).checkContentSafety(safeScript);
      
      expect(result.safe).toBe(true);
      expect(result.flaggedContent).toHaveLength(0);
      expect(result.confidence).toBeGreaterThan(90);
    });

    it("should flag inappropriate content", async () => {
      const unsafeScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          fullScript: "This contains violence and hate speech that is inappropriate."
        }
      };

      const result = await (validator as any).checkContentSafety(unsafeScript);
      expect(result.safe).toBe(false);
      expect(result.flaggedContent.length).toBeGreaterThan(0);
    });

    it("should flag excessive promotional content", async () => {
      const promoScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          fullScript: "Buy now! Sale! Discount! Purchase today! Deal! Buy this amazing product on sale with our special discount deal!",
          wordCount: 20
        }
      };

      const result = await (validator as any).checkContentSafety(promoScript);
      expect(result.safe).toBe(false);
      expect(result.flaggedContent.some((flag: string) => 
        flag.includes("promotional")
      )).toBe(true);
    });
  });

  describe("Engagement Metrics", () => {
    it("should calculate comprehensive engagement metrics", async () => {
      const metrics = await validator.calculateEngagementMetrics(mockScript);
      
      expect(metrics.hookStrength).toBeGreaterThan(0);
      expect(metrics.pacing).toBeGreaterThan(0);
      expect(metrics.clarity).toBeGreaterThan(0);
      expect(metrics.callToActionEffectiveness).toBeGreaterThan(0);
      expect(metrics.visualAppeal).toBeGreaterThan(0);
      expect(metrics.platformOptimization).toBeGreaterThan(0);
      
      // All metrics should be between 0 and 100
      Object.values(metrics).forEach(value => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      });
    });

    it("should calculate visual appeal based on visual words", async () => {
      const visualScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          fullScript: "Watch this amazing transformation! See the beautiful results. Look at this stunning display of colors.",
          wordCount: 16
        }
      };

      const visualAppeal = await (validator as any).calculateVisualAppeal(visualScript);
      expect(visualAppeal).toBeGreaterThan(50); // Should be high due to visual words
    });
  });

  describe("Validation Rules Management", () => {
    it("should return validation rules", () => {
      const rules = validator.getValidationRules();
      expect(rules).toBeDefined();
      expect(rules.length).toBeGreaterThan(0);
      
      rules.forEach(rule => {
        expect(rule.name).toBeDefined();
        expect(rule.weight).toBeGreaterThan(0);
        expect(rule.weight).toBeLessThanOrEqual(1);
        expect(rule.validator).toBeDefined();
      });
    });

    it("should add custom validation rule", () => {
      const initialCount = validator.getValidationRules().length;
      
      const customRule = {
        name: "custom_test_rule",
        weight: 0.1,
        validator: () => ({ passed: true, score: 100, message: "Test", severity: "info" as const })
      };

      validator.addValidationRule(customRule);
      
      const updatedRules = validator.getValidationRules();
      expect(updatedRules.length).toBe(initialCount + 1);
      expect(updatedRules.some(rule => rule.name === "custom_test_rule")).toBe(true);
    });

    it("should remove validation rule", () => {
      const rules = validator.getValidationRules();
      const firstRuleName = rules[0].name;
      
      const success = validator.removeValidationRule(firstRuleName);
      expect(success).toBe(true);
      
      const updatedRules = validator.getValidationRules();
      expect(updatedRules.length).toBe(rules.length - 1);
      expect(updatedRules.some(rule => rule.name === firstRuleName)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty scripts gracefully", async () => {
      const emptyScript = {
        ...mockScript,
        content: {
          fullScript: "",
          scenes: [],
          estimatedDuration: 0,
          wordCount: 0
        }
      };

      const validatedScript = await validator.validateScript(emptyScript);
      expect(validatedScript.validation.isValid).toBe(false);
      expect(validatedScript.validation.issues.length).toBeGreaterThan(0);
    });

    it("should handle scripts with only one scene", async () => {
      const singleSceneScript = {
        ...mockScript,
        content: {
          ...mockScript.content,
          scenes: [mockScript.content.scenes[0]]
        }
      };

      const validatedScript = await validator.validateScript(singleSceneScript);
      // Should still validate, but may have pacing issues
      expect(validatedScript.validation).toBeDefined();
    });

    it("should handle validation rule failures gracefully", async () => {
      // Add a rule that throws an error
      const faultyRule = {
        name: "faulty_rule",
        weight: 0.1,
        validator: () => {
          throw new Error("Validation rule error");
        }
      };

      validator.addValidationRule(faultyRule);
      
      // Should not crash the entire validation
      const validatedScript = await validator.validateScript(mockScript);
      expect(validatedScript.validation).toBeDefined();
      expect(validatedScript.validation.issues.some(issue => 
        issue.includes("Validation failed")
      )).toBe(true);
    });
  });
});