import { Response } from 'express';
import { routeAgentQuery } from '../../ai/supervisor';
import { parseReceiptImageWithGemini } from '../services/ocrService';
import { parseVoiceCommandExpense } from '../services/voiceService';
import { aiChatSchema, ocrAnalyzeSchema, voiceCommandSchema } from '../validators/schemas';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

export async function handleAIChat(req: AuthenticatedRequest, res: Response) {
  try {
    const parseResult = aiChatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.format() });
    }

    const { message, intent, history } = parseResult.data;
    const userId = req.user?.uid;

    const result = await routeAgentQuery({
      userId,
      intent,
      message,
      chatHistory: history,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('AI Controller Chat Error:', err);
    res.status(500).json({ error: 'Failed to process AI query', details: err.message });
  }
}

export async function handleAnalyzeReceipt(req: AuthenticatedRequest, res: Response) {
  try {
    const parseResult = ocrAnalyzeSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.format() });
    }

    const { base64Image, mimeType } = parseResult.data;

    const result = await parseReceiptImageWithGemini(base64Image, mimeType);
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('AI Controller OCR Error:', err);
    res.status(500).json({ error: 'Failed to process receipt OCR', details: err.message });
  }
}

export async function handleParseVoiceCommand(req: AuthenticatedRequest, res: Response) {
  try {
    const parseResult = voiceCommandSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.format() });
    }

    const { spokenText } = parseResult.data;

    const result = await parseVoiceCommandExpense(spokenText);
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('AI Controller Voice Error:', err);
    res.status(500).json({ error: 'Failed to process voice command', details: err.message });
  }
}
