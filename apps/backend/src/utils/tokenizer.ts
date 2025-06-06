import { getEncoding, type Tiktoken } from 'js-tiktoken';

const encoders: Record<string, Tiktoken> = {};

export function countTokens(text: string, model: string = 'gpt-4o-2024-08-06'): number {
  try {
    // For GPT-4o models, use the o200k_base encoding
    const encodingName = model.includes('gpt-4o') ? 'o200k_base' : 'cl100k_base';
    
    if (!encoders[encodingName]) {
      encoders[encodingName] = getEncoding(encodingName);
    }
    
    return encoders[encodingName].encode(text).length;
  } catch (error) {
    console.error('Error counting tokens:', error);
    // Fallback: rough estimate (4 chars = 1 token)
    return Math.ceil(text.length / 4);
  }
} 