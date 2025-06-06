import { config as baseConfig } from "@mini-clm/eslint-config/base";

export default [
  ...baseConfig,
  {
    ignores: [
      "node_modules/**",
      ".next/**", 
      "dist/**",
      "**/*.config.*"
    ]
  }
]; 