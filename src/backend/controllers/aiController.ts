import { Response } from 'express';
import { routeAgentQuery } from '../../ai/supervisor';
import { redactApiKey } from '../../ai/agents/coachAgent';
import { parseReceiptImageWithGemini } from '../services/ocrService';
import { parseVoiceCommandExpense, transcribeAudioWithGemini } from '../services/voiceService';
import { aiChatSchema, ocrAnalyzeSchema, voiceCommandSchema } from '../validators/schemas';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

export async function handleAIChat(req: AuthenticatedRequest, res: Response) {
  try {
    const parseResult = aiChatSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'المحتوى المدخل غير صالح أو فارغ', details: parseResult.error.format() });
    }

    const { message, intent, history } = parseResult.data;
    const trimmedMsg = (message || '').trim();
    if (!trimmedMsg) {
      return res.status(400).json({ error: 'رسالة السؤال فارغة، يرجى كتابة استفسارك المالي.' });
    }

    const userId = req.user?.uid;

    const result = await routeAgentQuery({
      userId,
      intent,
      message: trimmedMsg,
      chatHistory: history,
    });

    if (result && result.success === false) {
      return res.json({
        success: false,
        errorCode: result.errorCode,
        answer: result.answer || 'خدمة الذكاء الاصطناعي غير متاحة حالياً، يرجى إعادة المحاولة.',
      });
    }

    res.json({
      success: true,
      answer: result.answer,
      data: result.data || result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    const safeError = redactApiKey(err?.message || 'Failed to process AI query');
    console.error('AI Controller Chat Error:', safeError);
    res.status(500).json({ error: 'فشل في معالجة استفسار الذكاء الاصطناعي', details: safeError });
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


export async function handleTranscribeVoice(req: AuthenticatedRequest, res: Response) {
  try {
    const base64Audio = String(req.body?.base64Audio || '').trim();
    const mimeType = String(req.body?.mimeType || 'audio/webm').trim();
    if (!base64Audio) return res.status(400).json({ error: 'Audio payload is required' });
    if (base64Audio.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'Audio payload is too large' });
    const result = await transcribeAudioWithGemini(base64Audio, mimeType);
    if (!result.success) return res.status(422).json({ success: false, error: result.errorDetails || result.errorCode || 'Transcription failed' });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('AI Controller Transcription Error:', err);
    return res.status(500).json({ error: 'Failed to transcribe audio', details: err.message });
  }
}
