import { nextJsConfig } from "@mini-clm/eslint-config/next-js";

export default [
  ...nextJsConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "**/*.config.js",
      "**/*.config.ts"
    ]
  }
]; 