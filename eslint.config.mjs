import { config } from "@remotion/eslint-config-flat";
import tsParser from "@typescript-eslint/parser";

export default [
  ...config,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd(),
      },
    },
    rules: {
      // Video Generation Project Specific Rules
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "ignoreRestSiblings": true 
      }],
      "@typescript-eslint/explicit-function-return-type": ["warn", {
        "allowExpressions": true,
        "allowTypedFunctionExpressions": true,
        "allowHigherOrderFunctions": true
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-const": "error",
      "@typescript-eslint/no-var-requires": "error",
      
      // Performance optimizations for video processing
      "prefer-const": "error",
      "no-var": "error",
      "no-console": ["warn", { "allow": ["warn", "error"] }],
      
      // Service architecture rules
      "max-lines-per-function": ["warn", { "max": 150, "skipBlankLines": true, "skipComments": true }],
      "max-params": ["warn", { "max": 6 }],
      "complexity": ["warn", { "max": 15 }],
      
      // Async/await patterns for video processing
      "require-await": "error",
      "no-return-await": "error",
      "prefer-promise-reject-errors": "error",
      
      // Memory management for video processing
      "no-unused-expressions": ["error", { "allowShortCircuit": true, "allowTernary": true }],
      "no-unreachable": "error",
      "no-unreachable-loop": "error"
    }
  },
  {
    files: ["src/services/**/*.ts"],
    rules: {
      // Service-specific rules
      "@typescript-eslint/explicit-member-accessibility": ["error", { "accessibility": "explicit" }],
      "class-methods-use-this": "off", // Services often have utility methods
      "max-lines": ["warn", { "max": 1000, "skipBlankLines": true, "skipComments": true }],
      
      // Error handling requirements for video services
      "@typescript-eslint/promise-function-async": "error",
      "@typescript-eslint/await-thenable": "error"
    }
  },
  {
    files: ["src/types/**/*.ts"],
    rules: {
      // Type definition rules
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
      "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }],
      "@typescript-eslint/no-empty-interface": ["error", { "allowSingleExtends": true }]
    }
  },
  {
    files: ["src/server/**/*.ts"],
    rules: {
      // API and server rules
      "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],
      "no-process-env": "off" // Allow process.env in server code
    }
  },
  {
    files: ["src/short-creator/**/*.ts"],
    rules: {
      // Video creation specific rules
      "max-lines-per-function": ["warn", { "max": 200, "skipBlankLines": true, "skipComments": true }],
      "@typescript-eslint/no-floating-promises": "error" // Critical for video processing chains
    }
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "src/tests/**/*.ts"],
    rules: {
      // Test files - more lenient
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/unbound-method": "off"
    }
  },
  {
    files: [".claude/**/*.ts", ".roo/**/*.ts"],
    rules: {
      // Configuration files - allow flexibility
      "@typescript-eslint/no-explicit-any": "off",
      "max-lines": "off",
      "@typescript-eslint/explicit-function-return-type": "off"
    }
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".remotion/**",
      "static/**",
      "FramePack/temp/**",
      "FramePack/output/**",
      ".hive-mind/**",
      ".claude-flow/**",
      "**/*.generated.ts",
      "**/*.d.ts"
    ]
  }
];
