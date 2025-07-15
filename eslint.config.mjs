import { config } from "@remotion/eslint-config-flat";

export default [
  ...config,
  {
    files: ["*.config.js", "postcss.config.js", "tailwind.config.js"],
    languageOptions: {
      globals: {
        module: "readonly",
        exports: "writable",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
      },
    },
  },
];
