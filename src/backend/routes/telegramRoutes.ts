import { Router, Request, Response } from 'express';

const router = Router();

// ============================================================
// Telegram Webhook
// Telegram will send updates/messages to this endpoint
// POST /telegram/webhook
// ============================================================

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;

    console.log(
      'Telegram update received:',
      JSON.stringify(update)
    );

    // Telegram expects a fast HTTP 200 response
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

// ============================================================
// Telegram Webhook Setup
// Registers our webhook URL with Telegram
// POST /telegram/setup
// ============================================================

router.post('/setup', async (_req: Request, res: Response) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.error('TELEGRAM_BOT_TOKEN is not configured');

      return res.status(500).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured',
      });
    }

    const webhookUrl =
      'https://mizaniyaai.online/telegram/webhook';

    console.log(
      `Setting Telegram webhook to: ${webhookUrl}`
    );

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          url: webhookUrl,
          drop_pending_updates: true,
          allowed_updates: ['message', 'callback_query'],
        }),
      }
    );

    const telegramData = await telegramResponse.json();

    console.log(
      'Telegram setWebhook response:',
      JSON.stringify(telegramData)
    );

    if (!telegramResponse.ok) {
      return res.status(500).json({
        success: false,
        telegram: telegramData,
        webhookUrl,
      });
    }

    return res.status(200).json({
      success: true,
      telegram: telegramData,
      webhookUrl,
    });
  } catch (error: any) {
    console.error('Telegram setup error:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Telegram Webhook Information
// Useful later for checking if Telegram is connected
// GET /telegram/info
// ============================================================

router.get('/info', async (_req: Request, res: Response) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured',
      });
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );

    const telegramData = await telegramResponse.json();

    return res.status(
      telegramResponse.ok ? 200 : 500
    ).json({
      success: telegramResponse.ok,
      telegram: telegramData,
    });
  } catch (error: any) {
    console.error(
      'Telegram getWebhookInfo error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Telegram Bot Health Check
// GET /telegram/health
// ============================================================

router.get('/health', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    service: 'Mizaniya AI Telegram Bot',
    status: 'ready',
  });
});

export default router;