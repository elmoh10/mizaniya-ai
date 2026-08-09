import { Router, Request, Response } from 'express';

const router = Router();

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;

    console.log('Telegram update received:', JSON.stringify(update));

    // Telegram expects a fast 200 response
    return res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error: any) {
    console.error('Telegram webhook error:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    service: 'Mizaniya AI Telegram Bot',
    status: 'ready',
  });
});

export default router;