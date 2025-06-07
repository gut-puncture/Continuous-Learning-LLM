import { get_encoding } from "@dqbd/tiktoken";
import { FastifyBaseLogger } from "fastify";

// To use WASM, we need to download the file and base64 encode it.
// This is a workaround for Next.js build process.
// In a pure Node.js environment, you might not need this.
import wasm from "@dqbd/tiktoken/lite/tiktoken_bg.wasm?module";
import { init } from "@dqbd/tiktoken/lite/init";

// Initialize the WASM module
await init((imports) => WebAssembly.instantiate(wasm, imports));

const encoding = get_encoding("cl100k_base");

export function countTokens(text: string, logger: FastifyBaseLogger): number {
  try {
    if (!text) {
      return 0;
    }
    const tokens = encoding.encode(text);
    logger.info(
      `Successfully tokenized content with @dqbd/tiktoken: "${text}". Tokens: ${tokens.length}`
    );
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