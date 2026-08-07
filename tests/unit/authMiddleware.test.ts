import { describe, it, expect } from 'vitest';
import { requireAdmin, AuthenticatedRequest } from '../../src/backend/middlewares/authMiddleware';

describe('Auth Middleware Security Checks', () => {
  it('rejects non-admin users in requireAdmin', () => {
    let statusCode = 0;
    let jsonBody: any = null;

    const req = {
      user: { uid: 'user_123', role: 'user' },
    } as AuthenticatedRequest;

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (body: any) => {
            jsonBody = body;
          },
        };
      },
    };

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    requireAdmin(req, res, next);

    expect(nextCalled).toBe(false);
    expect(statusCode).toBe(403);
    expect(jsonBody?.error).toContain('Access denied');
  });

  it('allows admin users in requireAdmin', () => {
    const req = {
      user: { uid: 'admin_123', role: 'admin' },
    } as AuthenticatedRequest;

    const res: any = {};
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    requireAdmin(req, res, next);

    expect(nextCalled).toBe(true);
  });
});
