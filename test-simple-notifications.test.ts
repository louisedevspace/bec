import { describe, it, expect } from 'vitest';
import { supabaseAdmin } from '../server/routes/middleware';

describe('Simple Notifications System', () => {
  it('should have required tables in database', async () => {
    // Check if broadcast_notifications table exists
    const { data: broadcastTable } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'broadcast_notifications');

    expect(broadcastTable).toBeTruthy();
    expect(broadcastTable?.length).toBeGreaterThan(0);

    // Check if broadcast_delivery_logs table exists
    const { data: deliveryTable } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'broadcast_delivery_logs');

    expect(deliveryTable).toBeTruthy();
    expect(deliveryTable?.length).toBeGreaterThan(0);
  });

  it('should validate notification input', async () => {
    const invalidPayloads = [
      { title: '', body: 'Test body' },
      { title: 'Test title', body: '' },
      { title: 'A'.repeat(101), body: 'Test body' },
      { title: 'Test title', body: 'A'.repeat(501) }
    ];

    for (const payload of invalidPayloads) {
      const response = await fetch('http://localhost:5000/api/admin/notifications/send-to-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify(payload)
      });

      expect(response.status).toBe(400);
    }
  });

  it('should require authentication', async () => {
    const response = await fetch('http://localhost:5000/api/admin/notifications/send-to-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Notification',
        body: 'This is a test notification'
      })
    });

    expect(response.status).toBe(401);
  });

  it('should handle stats endpoint', async () => {
    const response = await fetch('http://localhost:5000/api/admin/notifications/stats', {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });

    // Should return 401 for invalid token
    expect(response.status).toBe(401);
  });
});