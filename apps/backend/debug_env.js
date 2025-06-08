import 'dotenv/config';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Current working directory:', process.cwd());
console.log('Script directory:', __dirname);
console.log('Expected .env path:', join(__dirname, '.env'));

// Try to read .env file directly
import { readFileSync } from 'fs';
try {
  const envContent = readFileSync('.env', 'utf8');
  console.log('.env file contents:');
  console.log(envContent);
} catch (error) {
  console.log('Could not read .env file:', error.message);
}

console.log('Environment variable OPENAI_API_KEY:');
console.log('Length:', process.env.OPENAI_API_KEY?.length || 'undefined');
console.log('First 10 chars:', process.env.OPENAI_API_KEY?.substring(0, 10) || 'undefined');
console.log('Last 10 chars:', process.env.OPENAI_API_KEY?.substring(-10) || 'undefined');
console.log('Full key (masked):', process.env.OPENAI_API_KEY ? `${process.env.OPENAI_API_KEY.substring(0, 8)}...${process.env.OPENAI_API_KEY.substring(-8)}` : 'undefined'); 