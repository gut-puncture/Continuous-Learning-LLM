import { get_encoding } from "@dqbd/tiktoken";

console.log("Tokenizer module loading...");

let encoding: ReturnType<typeof get_encoding> | null = null;

try {
  encoding = get_encoding("cl100k_base");
  console.log("Tiktoken encoding initialized successfully.");
} catch (error) {
  console.error("FATAL: Failed to initialize tiktoken.", error);
}

export function countTokens(text: string): number {
  console.log("Entering countTokens function...");

  if (!encoding) {
    console.error("ERROR in countTokens: Tiktoken encoding is not initialized.");
    return 0;
  }

  try {
    if (!text) {
      console.log("WARN in countTokens: Empty text, returning 0 tokens.");
      return 0;
    }
    const tokens = encoding.encode(text);
    console.log(`SUCCESS in countTokens: ${tokens.length} tokens counted for: "${text}"`);
    return tokens.length;
  } catch (e: unknown) {
    const error = e as Error;
    console.error("ERROR in countTokens: Failed to encode text:", error?.message || error);
    return 0;
  } finally {
    // No need to call free() on every call, as it disposes the encoding
  }
}

process.on('exit', () => {
    if (encoding) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (encoding as any).free();
    }
  }); 