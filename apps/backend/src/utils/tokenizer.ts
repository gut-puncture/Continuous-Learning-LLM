import { get_encoding, TiktokenEncoding } from "@dqbd/tiktoken";
import { FastifyBaseLogger } from "fastify";

// Use a singleton pattern to ensure the encoder is initialized only once.
let encoding: TiktokenEncoding | null = null;

try {
  encoding = get_encoding("cl100k_base");
} catch (error) {
  // This is a fallback for environments where wasm is not directly available
  console.error("Failed to initialize tiktoken with default wasm, trying manual load.", error);
}

export function countTokens(text: string, logger: FastifyBaseLogger): number {
  if (!encoding) {
    logger.error({ msg: "Tiktoken encoding not initialized." });
    return 0;
  }

  try {
    if (!text) {
      return 0;
    }
    const tokens = encoding.encode(text);
    // The logger is very noisy, so we will comment this out for now.
    // logger.info(
    //   `Successfully tokenized content with @dqbd/tiktoken: "${text}". Tokens: ${tokens.length}`
    // );
    return tokens.length;
  } catch (e: any) {
    const error = e as Error;
    logger.error({
      msg: "Error counting tokens in @dqbd/tiktoken",
      error: error.message,
      stack: error.stack,
    });
    return 0;
  }
}

// Optional: clean up the encoder when the process exits
process.on('exit', () => {
  if (encoding) {
    encoding.free();
  }
}); 