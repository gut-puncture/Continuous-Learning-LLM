import { encoding_for_model, type Tiktoken } from '@dqbd/tiktoken';

const encoders: Record<string, Tiktoken> = {};

export function countTokens(text: string, model: string = 'gpt-4o-2024-08-06'): number {
  if (!encoders[model]) {
    encoders[model] = encoding_for_model(model as any);
  }
  return encoders[model].encode(text).length;
} 