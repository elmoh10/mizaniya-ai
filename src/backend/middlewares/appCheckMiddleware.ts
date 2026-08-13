import { Response, NextFunction } from 'express';
import { getAppCheck } from 'firebase-admin/app-check';
import { AuthenticatedRequest } from './authMiddleware';

export async function optionalAppCheckMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (process.env.ENFORCE_APP_CHECK !== 'true') return next();
  const token = String(req.header('X-Firebase-AppCheck') || '').trim();
  if (!token) return res.status(401).json({ error: 'APP_CHECK_REQUIRED' });
  try {
    await getAppCheck().verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: 'INVALID_APP_CHECK_TOKEN' });
  }
}
