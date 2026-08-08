import { describe, it, expect, vi } from 'vitest';
import { normalizeChatHistory, buildCoachContents, askFinancialCoach } from '../../src/ai/agents/coachAgent';
import { ChatHistoryMessage } from '../../src/types';

describe('Financial Coach - Chat History Hardening', () => {
  it('1. Initial UI greeting or leading model message is excluded/normalized', () => {
    const history: ChatHistoryMessage[] = [
      { role: 'model', text: 'أهلاً بك! أنا كوتش ميزانية AI...' },
      { role: 'user', text: 'كيف حالك؟' }
    ];

    const normalized = normalizeChatHistory(history);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toEqual({ role: 'user', text: 'كيف حالك؟' });
  });

  it('2. History beginning with model is normalized', () => {
    const history: ChatHistoryMessage[] = [
      { role: 'model', text: 'رد الكوتش السابق' },
      { role: 'user', text: 'سؤال المستخدم' },
      { role: 'model', text: 'رد الكوتش' }
    ];

    const normalized = normalizeChatHistory(history);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].role).toBe('user');
    expect(normalized[0].text).toBe('سؤال المستخدم');
    expect(normalized[1].role).toBe('model');
    expect(normalized[1].text).toBe('رد الكوتش');
  });

  it('3. Consecutive same-role messages are normalized', () => {
    const history: ChatHistoryMessage[] = [
      { role: 'user', text: 'أريد حفظ المال' },
      { role: 'user', text: 'لشراء سيارة' },
      { role: 'model', text: 'رائع!' },
      { role: 'model', text: 'ما هي ميزانيتك؟' }
    ];

    const normalized = normalizeChatHistory(history);
    expect(normalized).toHaveLength(2);
    expect(normalized[0]).toEqual({ role: 'user', text: 'أريد حفظ المال\nلشراء سيارة' });
    expect(normalized[1]).toEqual({ role: 'model', text: 'رائع!\nما هي ميزانيتك؟' });
  });

  it('4. Empty history works', () => {
    const history: ChatHistoryMessage[] = [];
    const normalized = normalizeChatHistory(history);
    expect(normalized).toHaveLength(0);

    const contents = buildCoachContents('سؤال رئيسي', history);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('سؤال رئيسي');
  });

  it('5. One user question works', () => {
    const history: ChatHistoryMessage[] = [];
    const contents = buildCoachContents('ما هو الاستثمار؟', history);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('ما هو الاستثمار؟');
  });

  it('6. Multi-turn Coach conversation works with proper final user role alignment', () => {
    const history: ChatHistoryMessage[] = [
      { role: 'user', text: 'سؤال ١' },
      { role: 'model', text: 'جواب ١' },
      { role: 'user', text: 'سؤال ٢' }
    ];

    // buildCoachContents merges the trailing user turn 'سؤال ٢' into the final prompt
    const contents = buildCoachContents('سؤال جديد', history);
    expect(contents).toHaveLength(3);
    expect(contents[0]).toEqual({ role: 'user', parts: [{ text: 'سؤال ١' }] });
    expect(contents[1]).toEqual({ role: 'model', parts: [{ text: 'جواب ١' }] });
    // Expect the final user prompt to contain both question 2 and the new question
    expect(contents[contents.length - 1].role).toBe('user');
    expect(contents[contents.length - 1].parts[0].text).toContain('سؤال ٢');
    expect(contents[contents.length - 1].parts[0].text).toContain('سؤال جديد');
  });

  it('7. Multi-turn Coach conversation with model turn at end aligns properly', () => {
    const history: ChatHistoryMessage[] = [
      { role: 'user', text: 'سؤال ١' },
      { role: 'model', text: 'جواب ١' }
    ];

    const contents = buildCoachContents('سؤال ٢', history);
    expect(contents).toHaveLength(3);
    expect(contents[0]).toEqual({ role: 'user', parts: [{ text: 'سؤال ١' }] });
    expect(contents[1]).toEqual({ role: 'model', parts: [{ text: 'جواب ١' }] });
    expect(contents[2]).toEqual({ role: 'user', parts: [{ text: 'سؤال ٢' }] });
  });

  it('8. History limit behaves as expected', () => {
    const history: ChatHistoryMessage[] = Array.from({ length: 15 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'model',
      text: `رسالة ${i}`
    }));

    const normalized = normalizeChatHistory(history);
    expect(normalized.length).toBeLessThanOrEqual(10);
    expect(normalized[0].role).toBe('user');
  });
});
