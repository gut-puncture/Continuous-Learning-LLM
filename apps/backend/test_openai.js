import OpenAI from 'openai';
import 'dotenv/config';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Test data
const testConversations = [
  {
    thread: "User: I'm so excited about this new project!\nAssistant: That's great to hear!",
    targetMessage: "This is the best day ever!",
    expectedSentiment: 5
  },
  {
    thread: "User: I got stuck in traffic for 2 hours.\nAssistant: That sounds really frustrating.",
    targetMessage: "I feel completely drained and angry.",
    expectedSentiment: -4
  },
  {
    thread: "User: What time is the meeting tomorrow?\nAssistant: It's at 10am in conference room B.",
    targetMessage: "Thanks for letting me know the details.",
    expectedSentiment: 1
  }
];

const testMessages = [
  {
    content: "Our startup just closed a $100M Series A round!",
    expectedExcitement: 0.9
  },
  {
    content: "I made coffee this morning.",
    expectedExcitement: 0.1
  },
  {
    content: "The database server crashed and we lost all customer data!",
    expectedExcitement: 0.8
  }
];

const testTriples = [
  {
    content: "Alice works at ACME Corp as a senior engineer.",
    expectedTriples: [{"s":"Alice","p":"works_at","o":"ACME Corp"}, {"s":"Alice","p":"position","o":"senior engineer"}]
  },
  {
    content: "Bob and Carol founded StartupX in 2023 in San Francisco.",
    expectedTriples: [{"s":"Bob","p":"founded","o":"StartupX"}, {"s":"Carol","p":"founded","o":"StartupX"}]
  },
  {
    content: "I really love traveling to new places.",
    expectedTriples: []
  }
];

// Test sentiment analysis
async function testSentiment() {
  console.log("\n=== TESTING SENTIMENT ===");
  
  for (let i = 0; i < testConversations.length; i++) {
    const { thread, targetMessage, expectedSentiment } = testConversations[i];
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          {
            role: 'system',
            content: `You are a sentiment analyzer. Given a conversation and a target message, return only an integer from –5 (very negative) to +5 (very positive) representing the target message's sentiment.

Examples:
Conversation:
User: I'm so excited about this new project!
Assistant: That's great!
Target Message: "This is the best day ever!"
Sentiment: 5

Conversation:
User: I got stuck in traffic.
Assistant: That's frustrating.
Target Message: "I feel completely drained."
Sentiment: -4

Conversation:
User: What time is the meeting tomorrow?
Assistant: It's at 10am.
Target Message: "Thanks for letting me know."
Sentiment: 0`
          },
          {
            role: 'user',
            content: `Conversation:
${thread}
Target Message: "${targetMessage}"
Sentiment:`
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      });
      
      const result = parseInt(response.choices[0].message.content.trim());
      console.log(`Test ${i+1}: "${targetMessage}"`);
      console.log(`Expected: ${expectedSentiment}, Got: ${result}, Match: ${Math.abs(result - expectedSentiment) <= 1}`);
    } catch (error) {
      console.error(`Sentiment test ${i+1} failed:`, error.message);
    }
  }
}

// Test excitement analysis
async function testExcitement() {
  console.log("\n=== TESTING EXCITEMENT ===");
  
  for (let i = 0; i < testMessages.length; i++) {
    const { content, expectedExcitement } = testMessages[i];
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          {
            role: 'system',
            content: `You are an excitement rater. Given a single message, return only a decimal 0.0–1.0 indicating how exciting it is.

Examples:
Message: "The sky is blue today."
Excitement: 0.1

Message: "Our startup just closed a $100M round!"
Excitement: 0.9

Message: "I made coffee."
Excitement: 0.0`
          },
          {
            role: 'user',
            content: `Message: "${content}"
Excitement:`
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      });
      
      const result = parseFloat(response.choices[0].message.content.trim());
      console.log(`Test ${i+1}: "${content}"`);
      console.log(`Expected: ${expectedExcitement}, Got: ${result}, Close: ${Math.abs(result - expectedExcitement) <= 0.3}`);
    } catch (error) {
      console.error(`Excitement test ${i+1} failed:`, error.message);
    }
  }
}

// Test triple extraction  
async function testTripleExtraction() {
  console.log("\n=== TESTING TRIPLE EXTRACTION ===");
  
  for (let i = 0; i < testTriples.length; i++) {
    const { content, expectedTriples } = testTriples[i];
    
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          {
            role: 'system',
            content: `You are a fact extractor. Extract up to three factual triples from one message. Return JSON array [{"s":"", "p":"", "o":""}] or [] if none.

Examples:
Message: "Alice works at ACME Corp."
Output: [{"s":"Alice","p":"works_at","o":"ACME Corp"}]

Message: "Bob and Carol founded StartupX in 2023."
Output: [{"s":"Bob","p":"founded","o":"StartupX"},{"s":"Carol","p":"founded","o":"StartupX"}]

Message: "Project Beta deadline is 2025-12-01."
Output: [{"s":"Project Beta","p":"deadline","o":"2025-12-01"}]

Message: "I love traveling."
Output: []

Message: "The stock price of XYZ is $150."
Output: [{"s":"XYZ","p":"stock_price","o":"$150"}]`
          },
          {
            role: 'user',
            content: `Message: "${content}"
Output:`
          }
        ],
        temperature: 0.1,
        max_tokens: 200
      });
      
      const resultText = response.choices[0].message.content.trim();
      console.log(`Test ${i+1}: "${content}"`);
      console.log(`Expected: ${JSON.stringify(expectedTriples)}`);
      console.log(`Got: ${resultText}`);
      
      try {
        const result = JSON.parse(resultText);
        console.log(`Valid JSON: ${Array.isArray(result)}`);
      } catch {
        console.log(`Invalid JSON response`);
      }
    } catch (error) {
      console.error(`Triple test ${i+1} failed:`, error.message);
    }
  }
}

// Run all tests
async function runAllTests() {
  await testSentiment();
  await testExcitement(); 
  await testTripleExtraction();
}

runAllTests().catch(console.error); 