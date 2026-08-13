import { db } from '../config/firebaseAdmin';
import { transactionRepository } from '../repositories/transactionRepository';
import { matchWalletForUser } from './financialWalletMatcher';
import { getTrustedFinancialContext } from './financialContextService';
import {
  editTransactionAtomic,
  restoreTransactionAtomic,
  softDeleteTransactionAtomic,
} from './transactionLifecycleService';
import { CategoryType } from '../../types';

const PENDING_MINUTES = 10;

type SendMessage = (chatId: number, text: string) => Promise<void>;
type MarkBudgetStale = (userId: string) => Promise<void>;

interface HandlerInput {
  userId: string;
  telegramUserId: number;
  chatId: number;
  text: string;
  sendMessage: SendMessage;
  markBudgetStale: MarkBudgetStale;
}

interface HandlerResult {
  handled: boolean;
}

function normalizeArabicText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[؟?!،,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(
    Number.isFinite(value) ? value : 0
  );
}

function cairoDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function currentMonthKey(): string {
  return cairoDate().slice(0, 7);
}

function parseAmount(text: string): number | undefined {
  const matches = String(text).match(/\d+(?:[.,]\d+)?/g) || [];
  for (const match of matches.reverse()) {
    const value = Number(match.replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function isConfirm(normalized: string): boolean {
  return ['تاكيد', 'ايوه', 'ايوه سجل', 'ايوه سجله', 'موافق', 'نفذ'].includes(normalized);
}

function isCancel(normalized: string): boolean {
  return ['الغاء', 'لا', 'مش عايز', 'الغيه', 'الغي'].includes(normalized);
}

function sortTransactions(items: any[]): any[] {
  return [...items].sort((a, b) => {
    const aKey = String(a.createdAt || a.updatedAt || a.date || '');
    const bKey = String(b.createdAt || b.updatedAt || b.date || '');
    return bKey.localeCompare(aKey);
  });
}

async function loadTransactions(userId: string, includeDeleted = false): Promise<any[]> {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('transactions')
    .limit(250)
    .get();

  const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return sortTransactions(
    includeDeleted ? items : items.filter((item: any) => item.isDeleted !== true)
  );
}

function isStandalone(tx: any): boolean {
  return !(
    tx.relatedBillId ||
    tx.relatedDebtId ||
    tx.relatedObligationId ||
    tx.relatedInstallmentId
  );
}

function transactionLabel(tx: any): string {
  const type = tx.type === 'income' ? 'دخل' : tx.type === 'transfer' ? 'تحويل' : 'مصروف';
  return `${type}: ${tx.title || 'عملية'} — ${formatMoney(Number(tx.amount || 0))} ج.م — ${tx.date || '-'}`;
}

async function savePending(telegramUserId: number, payload: Record<string, unknown>) {
  const now = Date.now();
  await db
    .collection('telegram_pending_transactions')
    .doc(String(telegramUserId))
    .set({
      ...payload,
      createdAt: now,
      expiresAt: now + PENDING_MINUTES * 60 * 1000,
      used: false,
    });
}

async function matchWalletByHint(userId: string, hint: string) {
  const result = await matchWalletForUser(userId, `من ${hint}`);
  return result;
}

function parseTransfer(text: string): { amount: number; source: string; destination: string } | null {
  const normalized = normalizeArabicText(text)
    .replace(/\bلـ\b/g, ' الي ')
    .replace(/\bالى\b/g, ' الي ');

  if (!/(حول|حولت|تحويل)/.test(normalized)) return null;
  const amount = parseAmount(text);
  if (!amount) return null;

  const match = normalized.match(/(?:حول|حولت|تحويل).*?\d+(?:[.,]\d+)?(?:\s*جنيه)?\s+من\s+(.+?)\s+(?:الي|ل)\s+(.+)$/);
  if (!match) return null;

  return { amount, source: match[1].trim(), destination: match[2].trim() };
}

function categoryFromText(text: string): CategoryType | null {
  const n = normalizeArabicText(text);
  if (/اكل|سوبر|بقال|مطعم|قهوه|كافيه/.test(n)) return 'Food & Groceries';
  if (/مواصل|بنزين|سولار|اوبر|كريم|تاكسي/.test(n)) return 'Transport & Ride Apps';
  if (/سكن|ايجار|كهرب|مياه|غاز|مرافق/.test(n)) return 'Housing & Utilities';
  if (/صحه|دواء|صيدلي|دكتور|تعليم|مدرس|كورس/.test(n)) return 'Health & Education';
  if (/تسوق|ترفيه|هدوم|ملابس|خروجه|سينما/.test(n)) return 'Shopping & Entertainment';
  if (/عائله|عيله|اولاد|مصروف البيت/.test(n)) return 'Family & Allowances';
  if (/قسط|دين|قرض/.test(n)) return 'Installments & Debt';
  if (/فاتور|اشتراك|انترنت|نت|موبايل/.test(n)) return 'Bills & Subscriptions';
  if (/ادخار|تحويش|طوارئ/.test(n)) return 'Emergency & Savings';
  return null;
}

async function findTransactionCandidates(userId: string, text: string, type?: 'expense' | 'income') {
  const normalized = normalizeArabicText(text);
  const all = (await loadTransactions(userId)).filter(isStandalone);
  const filtered = type ? all.filter((tx) => tx.type === type) : all;
  if (normalized.includes('اخر')) return filtered.slice(0, 1);

  const noise = [
    'عدل', 'عدّل', 'غير', 'غيّر', 'خليه', 'خليها', 'وخليه', 'وخليها', 'احذف', 'امسح', 'الغي', 'الغى',
    'المصروف', 'مصروف', 'العمليه', 'عمليه', 'الدخل', 'دخل', 'جنيه', 'جنيهات', 'من', 'الي',
  ];
  let hint = normalized.replace(/\d+(?:[.,]\d+)?/g, ' ');
  for (const word of noise) hint = hint.replace(new RegExp(`\\b${normalizeArabicText(word)}\\b`, 'g'), ' ');
  hint = hint.replace(/\s+/g, ' ').trim();
  if (!hint) return filtered.slice(0, 5);

  const scored = filtered
    .map((tx) => {
      const title = normalizeArabicText(String(tx.title || ''));
      const words = hint.split(' ').filter(Boolean);
      const score = words.filter((w) => title.includes(w) || w.includes(title)).length / Math.max(1, words.length);
      return { tx, score };
    })
    .filter((x) => x.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  return scored.map((x) => x.tx).slice(0, 5);
}

async function prepareTransactionAction(
  input: HandlerInput,
  action: 'edit' | 'delete',
  candidates: any[],
  newAmount?: number
): Promise<HandlerResult> {
  const { telegramUserId, chatId, sendMessage } = input;
  if (candidates.length === 0) {
    await sendMessage(chatId, '⚠️ ملقتش عملية مطابقة أقدر أنفذ عليها الطلب.');
    return { handled: true };
  }

  if (candidates.length > 1) {
    await savePending(telegramUserId, {
      actionType: `v2_tx_select_${action}`,
      userId: input.userId,
      chatId,
      candidates: candidates.map((tx) => ({ txId: tx.id, label: transactionLabel(tx) })),
      newAmount: newAmount ?? null,
    });
    await sendMessage(
      chatId,
      `🔎 لقيت أكتر من عملية مطابقة:\n\n${candidates
        .map((tx, i) => `${i + 1}. ${transactionLabel(tx)}`)
        .join('\n')}\n\nاكتب رقم العملية، أو اكتب: إلغاء`
    );
    return { handled: true };
  }

  const tx = candidates[0];
  await savePending(telegramUserId, {
    actionType: action === 'edit' ? 'v2_edit_tx' : 'v2_delete_tx',
    userId: input.userId,
    chatId,
    txId: tx.id,
    oldAmount: Number(tx.amount || 0),
    newAmount: newAmount ?? null,
    title: tx.title || 'عملية مالية',
    txType: tx.type,
  });

  if (action === 'edit') {
    await sendMessage(
      chatId,
      `✏️ تعديل عملية جاهز للتأكيد:\n\n${transactionLabel(tx)}\n\n💰 المبلغ الجديد: ${formatMoney(Number(newAmount || 0))} ج.م\n\nسيتم تعديل رصيد المحفظة بالفرق تلقائيًا.\n\nاكتب: تأكيد\nأو: إلغاء`
    );
  } else {
    await sendMessage(
      chatId,
      `🗑️ حذف عملية جاهز للتأكيد:\n\n${transactionLabel(tx)}\n\nسيتم عكس تأثير العملية على رصيد المحفظة تلقائيًا.\n\nاكتب: تأكيد\nأو: إلغاء`
    );
  }
  return { handled: true };
}

async function handleV2Pending(input: HandlerInput): Promise<HandlerResult> {
  const { telegramUserId, chatId, text, sendMessage, markBudgetStale, userId } = input;
  const normalized = normalizeArabicText(text);
  const ref = db.collection('telegram_pending_transactions').doc(String(telegramUserId));
  const snap = await ref.get();
  if (!snap.exists) return { handled: false };
  const pending: any = snap.data();
  if (!String(pending?.actionType || '').startsWith('v2_')) return { handled: false };

  if (pending.used === true || Date.now() > Number(pending.expiresAt || 0)) {
    await ref.delete();
    await sendMessage(chatId, '⏰ العملية المنتظرة انتهت صلاحيتها. ابعتها من جديد.');
    return { handled: true };
  }
  if (isCancel(normalized)) {
    await ref.delete();
    await sendMessage(chatId, '❌ تم إلغاء العملية.');
    return { handled: true };
  }

  if (pending.actionType === 'v2_tx_select_edit' || pending.actionType === 'v2_tx_select_delete') {
    const num = Number(String(text).trim());
    const candidates = Array.isArray(pending.candidates) ? pending.candidates : [];
    const selected = Number.isInteger(num) ? candidates[num - 1] : null;
    if (!selected) {
      await sendMessage(chatId, `اكتب رقم من 1 إلى ${candidates.length}، أو اكتب: إلغاء`);
      return { handled: true };
    }
    const tx = await transactionRepository.getTransaction(userId, String(selected.txId));
    if (!tx) {
      await ref.delete();
      await sendMessage(chatId, '⚠️ العملية المختارة لم تعد موجودة.');
      return { handled: true };
    }
    const action = pending.actionType === 'v2_tx_select_edit' ? 'edit' : 'delete';
    await savePending(telegramUserId, {
      actionType: action === 'edit' ? 'v2_edit_tx' : 'v2_delete_tx',
      userId,
      chatId,
      txId: tx.id,
      oldAmount: Number(tx.amount || 0),
      newAmount: pending.newAmount ?? null,
      title: tx.title,
      txType: tx.type,
    });
    await sendMessage(
      chatId,
      action === 'edit'
        ? `✏️ اخترت: ${transactionLabel(tx)}\n\nالمبلغ الجديد: ${formatMoney(Number(pending.newAmount || 0))} ج.م\n\nاكتب: تأكيد\nأو: إلغاء`
        : `🗑️ اخترت: ${transactionLabel(tx)}\n\nاكتب: تأكيد\nأو: إلغاء`
    );
    return { handled: true };
  }

  if (!isConfirm(normalized)) {
    await sendMessage(chatId, 'عندك عملية منتظرة. اكتب: تأكيد أو إلغاء');
    return { handled: true };
  }

  try {
    if (pending.actionType === 'v2_edit_tx') {
      const result = await editTransactionAtomic(userId, String(pending.txId), {
        amount: Number(pending.newAmount),
      });
      await markBudgetStale(userId);
      await ref.delete();
      await sendMessage(
        chatId,
        `✅ تم تعديل العملية بنجاح.\n\n📝 ${result.title}\n💰 من ${formatMoney(result.oldAmount)} إلى ${formatMoney(result.newAmount)} ج.م\n🔄 تم تحديث رصيد المحفظة بالفرق تلقائيًا.`
      );
      return { handled: true };
    }

    if (pending.actionType === 'v2_delete_tx') {
      const result = await softDeleteTransactionAtomic(userId, String(pending.txId));
      await markBudgetStale(userId);
      await ref.delete();
      await sendMessage(
        chatId,
        `✅ تم حذف العملية وعكس تأثيرها على المحفظة.\n\n📝 ${result.title}\n💰 ${formatMoney(result.amount)} ج.م\n\nتقدر تقول: رجع آخر عملية محذوفة`
      );
      return { handled: true };
    }

    if (pending.actionType === 'v2_restore_tx') {
      const result = await restoreTransactionAtomic(userId, String(pending.txId));
      await markBudgetStale(userId);
      await ref.delete();
      await sendMessage(
        chatId,
        `✅ تم استرجاع العملية وإعادة تأثيرها على المحفظة.\n\n📝 ${result.title}\n💰 ${formatMoney(result.amount)} ج.م`
      );
      return { handled: true };
    }

    if (pending.actionType === 'v2_transfer') {
      const payload = {
        title: `تحويل من ${pending.sourceWalletName} إلى ${pending.destinationWalletName}`,
        amount: Number(pending.amount),
        currency: pending.currency || 'EGP',
        type: 'transfer' as const,
        category: 'Emergency & Savings' as const,
        walletId: String(pending.sourceWalletId),
        destinationWalletId: String(pending.destinationWalletId),
        paymentMethod: 'Cash' as const,
        date: cairoDate(),
        notes: 'تحويل بين المحافظ من Telegram',
        aiTag: 'telegram-transfer',
      };
      const tx = await transactionRepository.createTransaction(userId, payload);
      await markBudgetStale(userId);
      await ref.delete();
      await sendMessage(
        chatId,
        `✅ تم التحويل بنجاح.\n\n💰 ${formatMoney(tx.amount)} ج.م\n👛 من: ${pending.sourceWalletName}\n👛 إلى: ${pending.destinationWalletName}\n🧾 رقم العملية: ${tx.id}`
      );
      return { handled: true };
    }

    if (pending.actionType === 'v2_savings_target') {
      const amount = Number(pending.amount || 0);
      const monthKey = currentMonthKey();
      const budgetRef = db.collection('users').doc(userId).collection('budgets').doc(monthKey);
      const budgetSnap = await budgetRef.get();
      if (!budgetSnap.exists) throw new Error('لا توجد ميزانية للشهر الحالي.');
      const userSnap = await db.collection('users').doc(userId).get();
      const salary = Number(userSnap.data()?.salary || userSnap.data()?.monthlyIncome || 0);
      const percent = salary > 0 ? Math.min(100, Math.round((amount / salary) * 10000) / 100) : 0;
      await budgetRef.set(
        {
          requestedSavingsTargetAmount: amount,
          allocatedSavings: amount,
          remainingSavingsTarget: amount,
          targetSavingsPercent: percent,
          savingsTargetPercent: percent,
          isStale: true,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await ref.delete();
      await sendMessage(
        chatId,
        `🐷 تم تحديث هدف الادخار للشهر إلى ${formatMoney(amount)} ج.م${salary > 0 ? ` (${formatMoney(percent)}% من الدخل)` : ''}.\n\nهستخدم الهدف الجديد في حسابات الميزانية والتوقعات.`
      );
      return { handled: true };
    }
  } catch (error: any) {
    await ref.delete();
    await sendMessage(chatId, `⚠️ تعذر تنفيذ العملية: ${error?.message || 'خطأ غير معروف'}`);
    return { handled: true };
  }

  return { handled: false };
}

async function handleReadQueries(input: HandlerInput): Promise<HandlerResult> {
  const { userId, chatId, text, sendMessage } = input;
  const n = normalizeArabicText(text);
  const today = cairoDate();
  const monthKey = currentMonthKey();

  if (/رجعلي اخر مصروف|هات اخر مصروف|اخر مصروف ايه|اخر مصروف$/.test(n)) {
    const tx = (await loadTransactions(userId)).find((item) => item.type === 'expense');
    await sendMessage(chatId, tx ? `🧾 آخر مصروف:\n\n${transactionLabel(tx)}` : 'مفيش مصروفات مسجلة حتى الآن.');
    return { handled: true };
  }

  if (/اخر\s*5|اخر خمس|اخر العمليات|اخر مصروفات/.test(n)) {
    const allTxs = await loadTransactions(userId);
    const txs = (n.includes('مصروف') ? allTxs.filter((tx) => tx.type === 'expense') : allTxs).slice(0, 5);
    await sendMessage(
      chatId,
      txs.length
        ? `🧾 آخر ${txs.length} عمليات:\n\n${txs.map((tx, i) => `${i + 1}. ${transactionLabel(tx)}`).join('\n')}`
        : 'مفيش عمليات مسجلة حتى الآن.'
    );
    return { handled: true };
  }

  if (/عليا كام فواتير|فواتير لسه|الفواتير غير المدفوعه|الفواتير اللي عليا/.test(n)) {
    const snap = await db.collection('users').doc(userId).collection('bills').get();
    const bills = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).filter((b) => b.isPaid !== true);
    const total = bills.reduce((s, b) => s + Number(b.amount || 0), 0);
    await sendMessage(
      chatId,
      bills.length
        ? `🧾 عندك ${bills.length} فاتورة غير مدفوعة بإجمالي ${formatMoney(total)} ج.م:\n\n${bills.slice(0, 8).map((b, i) => `${i + 1}. ${b.titleAr || b.title || 'فاتورة'} — ${formatMoney(Number(b.amount || 0))} ج.م — ${b.dueDate || '-'}`).join('\n')}`
        : '✅ مفيش فواتير غير مدفوعة حاليًا.'
    );
    return { handled: true };
  }

  if (/الفواتير اللي قربت|فواتير قربت|فواتير قريبه|فاتوره قربت/.test(n)) {
    const snap = await db.collection('users').doc(userId).collection('bills').get();
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const bills = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((b) => b.isPaid !== true && b.dueDate)
      .map((b) => ({ ...b, days: Math.ceil((new Date(`${b.dueDate}T00:00:00Z`).getTime() - todayTime) / 86400000) }))
      .filter((b) => b.days >= 0 && b.days <= 7)
      .sort((a, b) => a.days - b.days);
    await sendMessage(
      chatId,
      bills.length
        ? `⏰ الفواتير المستحقة خلال 7 أيام:\n\n${bills.map((b) => `• ${b.titleAr || b.title} — ${formatMoney(Number(b.amount || 0))} ج.م — بعد ${b.days} يوم`).join('\n')}`
        : '✅ مفيش فواتير مستحقة خلال الـ7 أيام الجاية.'
    );
    return { handled: true };
  }

  const wantsToday = /صرفت كام النهارده|مصروفات النهارده|ملخص النهارده/.test(n);
  const wantsWeek = /صرفت كام الاسبوع|مصروفات الاسبوع|ملخص الاسبوع/.test(n);
  const wantsMonthSummary = /ملخص الشهر|ملخص شهري|اعمل ملخص الشهر/.test(n);
  if (wantsToday || wantsWeek || wantsMonthSummary) {
    const txs = await loadTransactions(userId);
    const now = new Date(`${today}T12:00:00Z`);
    const day = now.getUTCDay();
    const mondayOffset = (day + 6) % 7;
    const weekStart = new Date(now.getTime() - mondayOffset * 86400000).toISOString().slice(0, 10);
    const period = wantsToday ? txs.filter((tx) => tx.date === today) : wantsWeek ? txs.filter((tx) => String(tx.date || '') >= weekStart && String(tx.date || '') <= today) : txs.filter((tx) => String(tx.date || '').startsWith(monthKey));
    const expenses = period.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + Number(tx.amount || 0), 0);
    const income = period.filter((tx) => tx.type === 'income').reduce((s, tx) => s + Number(tx.amount || 0), 0);
    const net = income - expenses;
    const byCategory = new Map<string, number>();
    for (const tx of period.filter((x) => x.type === 'expense')) byCategory.set(tx.category || 'Other', (byCategory.get(tx.category || 'Other') || 0) + Number(tx.amount || 0));
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    const title = wantsToday ? 'ملخص النهاردة' : wantsWeek ? 'ملخص الأسبوع' : 'ملخص الشهر';
    await sendMessage(chatId, `📊 ${title}:\n\n💸 مصروفات: ${formatMoney(expenses)} ج.م\n💵 دخل: ${formatMoney(income)} ج.م\n💰 صافي التدفق: ${formatMoney(net)} ج.م${top ? `\n🏆 أعلى تصنيف: ${top[0]} — ${formatMoney(top[1])} ج.م` : ''}\n🧾 عدد العمليات: ${period.length}`);
    return { handled: true };
  }

  if (/اكتر حاجه صرفت|اكتر فئه|اكتر بند/.test(n)) {
    const txs = (await loadTransactions(userId)).filter((tx) => tx.type === 'expense' && String(tx.date || '').startsWith(monthKey));
    const map = new Map<string, number>();
    for (const tx of txs) map.set(tx.category || 'Other', (map.get(tx.category || 'Other') || 0) + Number(tx.amount || 0));
    const top = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
    await sendMessage(chatId, top ? `🏆 أعلى فئة صرف هذا الشهر:\n${top[0]}\n💸 ${formatMoney(top[1])} ج.م` : 'مفيش مصروفات كفاية للتحليل هذا الشهر.');
    return { handled: true };
  }

  if (/فاضلي كام من ميزانيه|فاضل كام من ميزانيه|متبقي من ميزانيه/.test(n)) {
    const category = categoryFromText(text);
    if (!category) {
      await sendMessage(chatId, 'حدد الفئة، مثال: فاضلي كام من ميزانية الأكل؟');
      return { handled: true };
    }
    const budgetSnap = await db.collection('users').doc(userId).collection('budgets').doc(monthKey).get();
    if (!budgetSnap.exists) {
      await sendMessage(chatId, '📊 مفيش ميزانية محفوظة للشهر الحالي.');
      return { handled: true };
    }
    const budget: any = budgetSnap.data();
    const item = (Array.isArray(budget.categories) ? budget.categories : []).find((c: any) => c.category === category);
    if (!item) {
      await sendMessage(chatId, 'الفئة دي مش موجودة في ميزانية الشهر الحالي.');
      return { handled: true };
    }
    const currentTxs = (await loadTransactions(userId)).filter(
      (tx) => tx.type === 'expense' && tx.category === category && String(tx.date || '').startsWith(monthKey)
    );
    const actualSpent = currentTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const remaining = Number(item.allocatedAmount || 0) - actualSpent;
    await sendMessage(chatId, `📊 ${item.categoryAr || category}:\n\n🎯 المخصص: ${formatMoney(Number(item.allocatedAmount || 0))} ج.م\n💸 المصروف الفعلي: ${formatMoney(actualSpent)} ج.م\n✅ المتبقي: ${formatMoney(remaining)} ج.م${remaining < 0 ? '\n⚠️ أنت متجاوز الميزانية.' : ''}`);
    return { handled: true };
  }

  if (/اقدر اصرف كام النهارده|اصرف كام النهارده/.test(n)) {
    const context = await getTrustedFinancialContext(userId);
    const safe = Number(context.safeToSpend || 0);
    const day = Number(today.slice(8, 10));
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const remainingDays = Math.max(1, days - day + 1);
    await sendMessage(chatId, `✅ المتاح الآمن المتبقي: ${formatMoney(safe)} ج.م\n📅 متوسط آمن تقريبي لباقي الشهر: ${formatMoney(safe / remainingDays)} ج.م يوميًا.`);
    return { handled: true };
  }

  if (/فلوسي هتكفيني|يكفيني لاخر الشهر|متوقع يتبقي|متوقع يتبقى/.test(n)) {
    const context = await getTrustedFinancialContext(userId);
    const txs = (await loadTransactions(userId)).filter((tx) => tx.type === 'expense' && String(tx.date || '').startsWith(monthKey));
    const spent = txs.reduce((s, tx) => s + Number(tx.amount || 0), 0);
    const day = Math.max(1, Number(today.slice(8, 10)));
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const projectedExpenses = (spent / day) * days;
    const income = Number(context.salary || 0);
    const commitments = Number(context.outstandingMonthlyCommitments || 0);
    const projected = income - projectedExpenses - commitments;
    await sendMessage(chatId, `🔮 توقع نهاية الشهر (بناءً على معدل صرفك الحالي):\n\n💵 دخل مسجل: ${formatMoney(income)} ج.م\n💸 مصروف متوقع: ${formatMoney(projectedExpenses)} ج.م\n📌 التزامات متبقية: ${formatMoney(commitments)} ج.م\n💰 متوقع يتبقى: ${formatMoney(projected)} ج.م\n\n${projected >= 0 ? '✅ بالمعدل الحالي، الوضع قابل للاستمرار.' : '⚠️ بالمعدل الحالي قد يحصل عجز قبل نهاية الشهر.'}`);
    return { handled: true };
  }

  if (/هدف التوفير واقعي|هدف الادخار واقعي|هل اقدر اوفر/.test(n)) {
    const context = await getTrustedFinancialContext(userId);
    const budgetSnap = await db.collection('users').doc(userId).collection('budgets').doc(monthKey).get();
    const b: any = budgetSnap.data() || {};
    const target = Number(b.requestedSavingsTargetAmount || b.allocatedSavings || b.remainingSavingsTarget || 0);
    if (target <= 0) {
      await sendMessage(chatId, 'حدد هدف ادخار الأول، مثال: عايز أوفر 2000 الشهر ده');
      return { handled: true };
    }
    const txs = (await loadTransactions(userId)).filter((tx) => tx.type === 'expense' && String(tx.date || '').startsWith(monthKey));
    const spent = txs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const day = Math.max(1, Number(today.slice(8, 10)));
    const [year, month] = monthKey.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const projectedExpenses = (spent / day) * daysInMonth;
    const salary = Number(context.salary || 0);
    const commitments = Number(context.outstandingMonthlyCommitments || 0);
    const projectedCapacity = Math.max(0, salary - projectedExpenses - commitments);
    const feasible = target <= projectedCapacity;
    await sendMessage(chatId, `🐷 تقييم هدف الادخار:\n\n🎯 الهدف: ${formatMoney(target)} ج.م\n📈 القدرة المتوقعة حسب صرفك الحالي: ${formatMoney(projectedCapacity)} ج.م\n\n${feasible ? '✅ الهدف يبدو واقعيًا بالمعدل الحالي.' : `⚠️ الهدف أعلى من القدرة المتوقعة بحوالي ${formatMoney(target - projectedCapacity)} ج.م. حاول تقلل الصرف أو تخفض الهدف.`}`);
    return { handled: true };
  }

  if (/اوفر كام في اليوم|اوفّر كام في اليوم/.test(n)) {
    const budgetSnap = await db.collection('users').doc(userId).collection('budgets').doc(monthKey).get();
    const b: any = budgetSnap.data() || {};
    const target = Number(b.requestedSavingsTargetAmount || b.allocatedSavings || b.remainingSavingsTarget || 0);
    const day = Number(today.slice(8, 10));
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const remainingDays = Math.max(1, days - day + 1);
    await sendMessage(chatId, target > 0 ? `🐷 هدف الادخار الحالي: ${formatMoney(target)} ج.م\n📅 المتوسط المطلوب من دلوقتي: ${formatMoney(target / remainingDays)} ج.م يوميًا.` : 'حدد هدف ادخار الأول، مثال: عايز أوفر 2000 الشهر ده');
    return { handled: true };
  }

  return { handled: false };
}

export async function handleTelegramFinancialAssistantV2(input: HandlerInput): Promise<HandlerResult> {
  const pending = await handleV2Pending(input);
  if (pending.handled) return pending;

  const { userId, telegramUserId, chatId, text, sendMessage } = input;
  const n = normalizeArabicText(text);

  if (/^(رجع|استرجع).*عمليه محذوفه|رجع اخر عمليه محذوفه|استرجع اخر عمليه/.test(n)) {
    const deleted = (await loadTransactions(userId, true)).filter((tx) => tx.isDeleted === true && isStandalone(tx));
    if (!deleted.length) {
      await sendMessage(chatId, 'مفيش عمليات محذوفة قابلة للاسترجاع.');
      return { handled: true };
    }
    const tx = deleted[0];
    await savePending(telegramUserId, { actionType: 'v2_restore_tx', userId, chatId, txId: tx.id, title: tx.title, amount: tx.amount });
    await sendMessage(chatId, `♻️ استرجاع عملية جاهز:\n\n${transactionLabel(tx)}\n\nسيتم إعادة تأثيرها على المحفظة.\n\nاكتب: تأكيد\nأو: إلغاء`);
    return { handled: true };
  }

  if (/^(عدل|غير|غيّر|عدّل)/.test(n) && /(مصروف|عمليه|دخل)/.test(n)) {
    const amount = parseAmount(text);
    if (!amount) {
      await sendMessage(chatId, 'اكتب المبلغ الجديد بوضوح، مثال: عدل آخر مصروف وخليه 30 جنيه');
      return { handled: true };
    }
    const type = n.includes('مصروف') ? 'expense' : n.includes('دخل') ? 'income' : undefined;
    return prepareTransactionAction(input, 'edit', await findTransactionCandidates(userId, text, type), amount);
  }

  if (/^(احذف|امسح|الغي|الغى)/.test(n) && /(مصروف|عمليه|دخل)/.test(n)) {
    const type = n.includes('مصروف') ? 'expense' : n.includes('دخل') ? 'income' : undefined;
    return prepareTransactionAction(input, 'delete', await findTransactionCandidates(userId, text, type));
  }

  const transfer = parseTransfer(text);
  if (transfer) {
    const sourceMatch = await matchWalletByHint(userId, transfer.source);
    const destinationMatch = await matchWalletByHint(userId, transfer.destination);
    if (sourceMatch.ambiguous || destinationMatch.ambiguous || !sourceMatch.wallet || !destinationMatch.wallet) {
      await sendMessage(chatId, '👛 مش قادر أحدد محفظتي التحويل بدقة. اكتب أسماء المحافظ زي ما هي مسجلة، مثال: حول 500 من كاش إلى CIB');
      return { handled: true };
    }
    if (sourceMatch.wallet.id === destinationMatch.wallet.id) {
      await sendMessage(chatId, '⚠️ محفظة المصدر والاستلام لازم يكونوا مختلفين.');
      return { handled: true };
    }
    if (sourceMatch.wallet.currency !== destinationMatch.wallet.currency) {
      await sendMessage(chatId, '⚠️ التحويل بين عملتين مختلفتين محتاج سعر صرف، والميزة دي مش مفعلة تلقائيًا لسه.');
      return { handled: true };
    }
    await savePending(telegramUserId, {
      actionType: 'v2_transfer', userId, chatId, amount: transfer.amount,
      sourceWalletId: sourceMatch.wallet.id, sourceWalletName: sourceMatch.wallet.nameAr || sourceMatch.wallet.name,
      destinationWalletId: destinationMatch.wallet.id, destinationWalletName: destinationMatch.wallet.nameAr || destinationMatch.wallet.name,
      currency: sourceMatch.wallet.currency || 'EGP',
    });
    await sendMessage(chatId, `🔄 تحويل جاهز للتأكيد:\n\n💰 ${formatMoney(transfer.amount)} ج.م\n👛 من: ${sourceMatch.wallet.nameAr || sourceMatch.wallet.name}\n👛 إلى: ${destinationMatch.wallet.nameAr || destinationMatch.wallet.name}\n\nاكتب: تأكيد\nأو: إلغاء`);
    return { handled: true };
  }

  if (/(عايز|اريد|نفسي).*اوفر|وفرلي|اوفر|هدف الادخار|هدف التوفير/.test(n) && /(الشهر|شهري)/.test(n)) {
    const amount = parseAmount(text);
    if (!amount) {
      await sendMessage(chatId, 'حدد مبلغ الادخار، مثال: عايز أوفر 2000 الشهر ده');
      return { handled: true };
    }
    const budgetSnap = await db.collection('users').doc(userId).collection('budgets').doc(currentMonthKey()).get();
    if (!budgetSnap.exists) {
      await sendMessage(chatId, '📊 لازم يكون عندك ميزانية للشهر الحالي قبل تحديد هدف الادخار.');
      return { handled: true };
    }
    await savePending(telegramUserId, { actionType: 'v2_savings_target', userId, chatId, amount });
    await sendMessage(chatId, `🐷 هدف ادخار جديد: ${formatMoney(amount)} ج.م للشهر الحالي.\n\nاكتب: تأكيد\nأو: إلغاء`);
    return { handled: true };
  }

  return handleReadQueries(input);
}
