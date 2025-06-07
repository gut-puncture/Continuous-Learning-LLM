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
  },
  {
    files: ["**/__tests__/**", "**/jest.setup.js", "**/*.test.{js,ts,jsx,tsx}"],
    languageOptions: {
      globals: {
        jest: "readonly",
        global: "readonly",
        afterEach: "readonly",
        beforeEach: "readonly",
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly"
      }
    }
  }
]; 