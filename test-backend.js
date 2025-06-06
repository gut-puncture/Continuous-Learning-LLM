// Simple test script for the backend API
const API_BASE = process.env.BACKEND_URL || 'http://localhost:3001';

async function testAPI() {
  console.log('🧪 Testing Mini-CLM Backend API...\n');

  // Test 1: Health check
  try {
    console.log('1. Testing health check...');
    const healthResponse = await fetch(`${API_BASE}/healthz`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }

  // Test 2: Chat endpoint
  try {
    console.log('\n2. Testing chat endpoint...');
    const chatResponse = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: 'test-user@example.com',
        content: 'Hello, this is a test message!'
      })
    });
    
    const chatData = await chatResponse.json();
    console.log('✅ Chat response:', chatData);
    
    // Test 3: History endpoint with the threadId from chat
    if (chatData.threadId) {
      console.log('\n3. Testing history endpoint...');
      const historyResponse = await fetch(`${API_BASE}/history/${chatData.threadId}`);
      const historyData = await historyResponse.json();
      console.log('✅ History response:', historyData);
    }
  } catch (error) {
    console.log('❌ API test failed:', error.message);
  }
}

// Run tests
testAPI().catch(console.error); 