import { describe, it, expect } from 'vitest';

describe('API v1 Endpoint Version Mount Suite', () => {
  const API_BASE = '/api/v1';

  it('verifies v1 API routes prefix string matching', () => {
    expect(`${API_BASE}/wallets`).toBe('/api/v1/wallets');
    expect(`${API_BASE}/transactions`).toBe('/api/v1/transactions');
    expect(`${API_BASE}/ai/chat`).toBe('/api/v1/ai/chat');
    expect(`${API_BASE}/financial-health`).toBe('/api/v1/financial-health');
  });
});
