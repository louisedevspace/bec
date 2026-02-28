// Debug script to test the notification API endpoints
async function debugNotificationAPI() {
  const baseUrl = 'http://localhost:5050';
  
  console.log('=== DEBUGGING NOTIFICATION API ENDPOINTS ===\n');
  
  // Test 1: Check if the server is running
  try {
    console.log('1. Testing server connectivity...');
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    console.log('Health check status:', healthResponse.status);
    if (!healthResponse.ok) {
      const healthText = await healthResponse.text();
      console.log('Health response:', healthText.substring(0, 200));
    }
  } catch (error) {
    console.error('Server connectivity error:', error);
    return;
  }
  
  // Test 2: Check the stats endpoint without auth
  try {
    console.log('\n2. Testing /api/admin/notifications/streamlined/stats (no auth)...');
    const statsResponse = await fetch(`${baseUrl}/api/admin/notifications/streamlined/stats`);
    console.log('Stats response status:', statsResponse.status);
    console.log('Stats response headers:', Object.fromEntries(statsResponse.headers.entries()));
    
    const statsText = await statsResponse.text();
    console.log('Stats response body (first 300 chars):', statsText.substring(0, 300));
    
    // Try to parse as JSON
    try {
      const statsData = JSON.parse(statsText);
      console.log('Stats response is valid JSON:', statsData);
    } catch (e) {
      console.log('Stats response is not JSON, likely HTML error page');
    }
  } catch (error) {
    console.error('Stats endpoint error:', error);
  }
  
  // Test 3: Check the send endpoint without auth
  try {
    console.log('\n3. Testing /api/admin/notifications/streamlined/send (no auth)...');
    const sendResponse = await fetch(`${baseUrl}/api/admin/notifications/streamlined/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Test',
        body: 'Test message'
      })
    });
    
    console.log('Send response status:', sendResponse.status);
    console.log('Send response headers:', Object.fromEntries(sendResponse.headers.entries()));
    
    const sendText = await sendResponse.text();
    console.log('Send response body (first 300 chars):', sendText.substring(0, 300));
    
    // Try to parse as JSON
    try {
      const sendData = JSON.parse(sendText);
      console.log('Send response is valid JSON:', sendData);
    } catch (e) {
      console.log('Send response is not JSON, likely HTML error page');
    }
  } catch (error) {
    console.error('Send endpoint error:', error);
  }
  
  // Test 4: List all available routes
  try {
    console.log('\n4. Testing /api/routes (if available)...');
    const routesResponse = await fetch(`${baseUrl}/api/routes`);
    console.log('Routes response status:', routesResponse.status);
    if (routesResponse.ok) {
      const routesData = await routesResponse.json();
      console.log('Available routes:', routesData);
    } else {
      console.log('Routes endpoint not available');
    }
  } catch (error) {
    console.log('Routes endpoint not available');
  }
  
  console.log('\n=== DEBUGGING COMPLETE ===');
}

// Run the debug
debugNotificationAPI().catch(console.error);