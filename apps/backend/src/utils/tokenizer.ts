import { encode } from 'gpt-tokenizer';
import { FastifyBaseLogger } from 'fastify';

export function countTokens(text: string, logger: FastifyBaseLogger): number {
  try {
    if (!text) {
      return 0;
    }
    const tokens = encode(text);
    logger.info(`Successfully tokenized content: "${text}". Tokens: ${tokens.length}`);
    return tokens.length;
  } catch (e: any) {
    const error = e as Error;
    logger.error({ msg: 'Error counting tokens in gpt-tokenizer', error: error.message, stack: error.stack });
    return 0;
  }
} 