// Test script for streamlined notification API endpoints
async function testNotificationAPI() {
  const baseUrl = 'http://localhost:5050';
  
  // Test the stats endpoint
  try {
    console.log('Testing /api/admin/notifications/stats endpoint...');
    const statsResponse = await fetch(`${baseUrl}/api/admin/notifications/stats`);
    console.log('Stats response status:', statsResponse.status);
    
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      console.log('Stats data:', statsData);
    } else {
      const errorText = await statsResponse.text();
      console.log('Stats error response:', errorText.substring(0, 200));
    }
  } catch (error) {
    console.error('Stats endpoint error:', error);
  }
  
  // Test the send endpoint
  try {
    console.log('\nTesting /api/admin/notifications/send endpoint...');
    const sendResponse = await fetch(`${baseUrl}/api/admin/notifications/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: This will fail auth, but we can see if the route exists
      },
      body: JSON.stringify({
        title: 'Test Notification',
        body: 'This is a test notification',
        role: 'all',
        channel: 'push'
      })
    });
    
    console.log('Send response status:', sendResponse.status);
    
    if (sendResponse.ok) {
      const sendData = await sendResponse.json();
      console.log('Send response data:', sendData);
    } else {
      const errorText = await sendResponse.text();
      console.log('Send error response:', errorText.substring(0, 200));
    }
  } catch (error) {
    console.error('Send endpoint error:', error);
  }
}

// Run the test
testNotificationAPI().catch(console.error);