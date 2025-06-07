import { get_encoding, TiktokenEncoding } from "@dqbd/tiktoken";

console.log("Tokenizer module loading...");

let encoding: TiktokenEncoding | null = null;

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
      console.log("WARN in countTokens: input text is empty.");
      return 0;
    }
    const tokens = encoding.encode(text);
    console.log(`Successfully tokenized content. Tokens: ${tokens.length}`);
    return tokens.length;
  } catch (e: any) {
    const error = e as Error;
    console.error("ERROR in countTokens during encoding:", {
      message: error.message,
      stack: error.stack,
    });
    return 0;
  }
}

process.on('exit', () => {
    if (encoding) {
      encoding.free();
    }
  }); 