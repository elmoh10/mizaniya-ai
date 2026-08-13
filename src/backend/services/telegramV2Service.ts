import { db } from '../config/firebaseAdmin';
import { transactionRepository } from '../repositories/transactionRepository';
import { matchWalletForUser } from './financialWalletMatcher';
import { getTrustedFinancialContext } from './financialContextService';
import { executeBillPayment } from './financialExecutionService';
import { billRepository, goalRepository } from '../repositories/budgetAndGoalRepositories';
import {
  editTransactionAtomic,
  restoreTransactionAtomic,
  softDeleteTransactionAtomic,
} from './transactionLifecycleService';
import { CategoryType, Currency, Wallet } from '../../types';
import {
  archiveWalletForUser,
  createWalletForUser,
  getWalletsForUser,
  updateWalletForUser,
} from './walletService';

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

function billRemainingAmount(bill: any): number {
  if (bill?.isPaid === true) return 0;
  const original = Number(bill?.amount || 0);
  const storedRemaining = Number(bill?.remainingAmount);
  if (Number.isFinite(storedRemaining)) return Math.max(0, storedRemaining);
  const paid = Math.max(0, Number(bill?.paidAmount || 0));
  return Math.max(0, original - paid);
}

function billLabel(bill: any): string {
  const remaining = billRemainingAmount(bill);
  const original = Number(bill?.amount || 0);
  const paid = Math.max(0, original - remaining);
  const status = paid > 0 && remaining > 0 ? ` — مدفوع ${formatMoney(paid)} / متبقي ${formatMoney(remaining)}` : '';
  return `${bill?.titleAr || bill?.title || 'فاتورة'} — ${formatMoney(original)} ج.م${status} — ${bill?.dueDate || '-'}`;
}

function parseBillPaymentRequest(text: string): { amount?: number; titleHint: string } | null {
  const normalized = normalizeArabicText(text);
  if (!/(دفعت|سددت|سداد|اسدد|هسدد|سدد)/.test(normalized)) return null;
  if (!/(فاتور|كهرب|مياه|غاز|انترنت|النت|تليفون|موبايل)/.test(normalized)) return null;

  const amount = parseAmount(text);
  let titleHint = normalized
    .replace(/\d+(?:[.,]\d+)?/g, ' ')
    .replace(/\b(?:دفعت|سددت|سداد|اسدد|هسدد|سدد|فاتوره|فاتورة|جنيه|جنيهات|من|المحفظه|محفظه|الكاش|كاش)\b/g, ' ')
    .replace(/\s+(?:علي|على|بـ|ب)\s+.+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Wallet phrases typically follow "من". Remove that suffix from the raw normalized text.
  const beforeWallet = normalized.split(/\s+من\s+/)[0];
  if (beforeWallet !== normalized) {
    titleHint = beforeWallet
      .replace(/\d+(?:[.,]\d+)?/g, ' ')
      .replace(/\b(?:دفعت|سددت|سداد|اسدد|هسدد|سدد|فاتوره|فاتورة|جنيه|جنيهات)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { amount, titleHint };
}

function scoreBillMatch(bill: any, hint: string): number {
  const target = normalizeArabicText(`${bill?.titleAr || ''} ${bill?.title || ''} ${bill?.biller || ''}`);
  const cleanHint = normalizeArabicText(hint);
  if (!cleanHint) return 0.4;
  if (target === cleanHint) return 1;
  if (target.includes(cleanHint) || cleanHint.includes(target)) return 0.95;
  const words = cleanHint.split(' ').filter((w) => w.length >= 2);
  if (!words.length) return 0.4;
  const hits = words.filter((w) => target.includes(w)).length;
  return hits / words.length;
}

async function findBillCandidates(userId: string, hint: string): Promise<any[]> {
  const bills = (await billRepository.getBills(userId))
    .filter((bill: any) => billRemainingAmount(bill) > 0);
  if (!bills.length) return [];
  const scored = bills
    .map((bill: any) => ({ bill, score: scoreBillMatch(bill, hint) }))
    .filter((entry) => entry.score >= 0.35)
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored.map((x) => x.bill).slice(0, 8) : [];
}

function parseTransfer(text: string): { amount: number; source: string; destination: string } | null {
  // Accept Egyptian/Arabic transfer phrasing, including attached destination prefixes:
  // "حول 100 جنيه من فودافون كاش للكاش"
  // "حول 100 من الكاش لفودافون كاش"
  // "حول 100 من الكاش إلى فودافون كاش"
  let normalized = normalizeArabicText(text)
    .replace(/الى/g, 'الي')
    .replace(/لـ/g, 'ل');

  // Arabic writes "to + the" as "لل..." (e.g. "للكاش"). Normalize it
  // to a standalone destination separator while preserving the definite article.
  normalized = normalized
    .replace(/\s+لل(?=\S)/g, ' الي ال')
    .replace(/\s+ل(?=\S)/g, ' الي ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!/(حول|حولت|تحويل)/.test(normalized)) return null;

  const amount = parseAmount(text);
  if (!amount) return null;

  const match = normalized.match(
    /(?:حول|حولت|تحويل).*?\d+(?:[.,]\d+)?(?:\s*جنيه)?\s+من\s+(.+?)\s+الي\s+(.+)$/
  );

  if (!match) return null;

  const source = match[1].trim();
  const destination = match[2].trim();

  if (!source || !destination) return null;

  return { amount, source, destination };
}


function parseGoalAmount(text: string): number | undefined {
  const raw = String(text || '');
  // For goals, the financial amount is the number attached to a money expression,
  // NOT the target year (e.g. 30000 جنيه قبل ديسمبر 2027).
  const money = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:جنيه|جنية|ج\.م|egp)/i);
  if (money) {
    const value = Number(money[1].replace(',', '.'));
    if (Number.isFinite(value) && value > 0) return value;
  }
  const numbers = (raw.match(/\d+(?:[.,]\d+)?/g) || [])
    .map(v => Number(v.replace(',', '.')))
    .filter(v => Number.isFinite(v) && v > 0 && !(v >= 2000 && v <= 2100));
  return numbers[0];
}

function parseGoalDate(text: string): string {
  const raw = String(text || '');
  const iso = raw.match(/\b(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)\b/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`;
  const n = normalizeArabicText(raw);
  const yearMatch = n.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear() + 1;
  const months: Record<string, number> = { يناير:1, فبراير:2, مارس:3, ابريل:4, مايو:5, يونيو:6, يوليو:7, اغسطس:8, سبتمبر:9, اكتوبر:10, نوفمبر:11, ديسمبر:12 };
  for (const [name, month] of Object.entries(months)) {
    if (n.includes(name)) return `${year}-${String(month).padStart(2, '0')}-01`;
  }
  return `${year}-12-31`;
}

function goalMonthlyTarget(target: number, current: number, targetDate: string): number {
  const end = new Date(`${targetDate}T12:00:00Z`).getTime();
  const months = Math.max(1, Math.ceil((end - Date.now()) / (30.4375 * 86400000)));
  return Math.max(0, Math.ceil((target - current) / months));
}

function goalLabel(goal: any): string {
  const target = Math.max(0, Number(goal.targetAmount || 0));
  const current = Math.max(0, Number(goal.currentAmount || 0));
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return `${goal.titleAr || goal.title || 'هدف مالي'} — ${formatMoney(current)} / ${formatMoney(target)} ج.م (${pct}%)`;
}

async function findGoalCandidates(userId: string, hint: string, includeArchived = false): Promise<any[]> {
  const goals: any[] = await goalRepository.getGoals(userId, includeArchived);
  const n = normalizeArabicText(hint);
  if (/اخر هدف/.test(n)) return goals.slice(-1).reverse().slice(0, 1);

  // First use the stored goal title itself. This makes phrases such as
  // "حط 500 جنيه في هدف العربية من الكاش" resolve "العربية" exactly.
  const exact = goals.filter((goal:any) => {
    const title = normalizeArabicText(String(goal.titleAr || goal.title || '')).trim();
    return title.length > 1 && (n.includes(title) || title.includes(n));
  });
  if (exact.length) return exact.slice(0, 5);

  let clean = n
    .replace(/\d+(?:[.,]\d+)?/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    .replace(/(?:جنيه|جنيهات|جنية|ج\.م|egp)/g, ' ')
    .replace(/(?:من|الى|الي|للكاش|للكاش|الكاش|كاش|فودافون|انستا ?باي|instapay|cib|محفظه|محفظة)/g, ' ');
  const noise = ['هدف','الهدف','عايز','اريد','اعمل','انشئ','اضف','زود','حط','حطيت','ضيف','ادخر','حوش','وفرت','وفر','اسحب','خد','ارجع','في','على','اكتب','عدل','غير','خليه','احذف','امسح','رجع','استرجع'];
  for (const word of noise) clean = clean.split(normalizeArabicText(word)).join(' ');
  clean = clean.replace(/\s+/g, ' ').trim();
  if (!clean) return goals.slice(0, 5);

  const words = clean.split(' ').filter(w => w.length > 1);
  return goals.map((goal:any) => {
    const title = normalizeArabicText(`${goal.titleAr || ''} ${goal.title || ''}`);
    const hits = words.filter(w => title.includes(w) || (title.length > 1 && w.includes(title.trim()))).length;
    return { goal, score: hits / Math.max(1, words.length) };
  }).filter(x => x.score >= 0.5).sort((a,b)=>b.score-a.score).map(x=>x.goal).slice(0,5);
}

function parseGoalCreate(text: string): { title: string; targetAmount: number; targetDate: string } | null {
  const n = normalizeArabicText(text);
  if (!/(هدف|اوفر|احوش|توفير|ادخار)/.test(n) || /(الشهر|شهري)/.test(n)) return null;
  if (!/(اعمل|انشئ|اضف|عايز|اريد|نفسي)/.test(n)) return null;
  const amount = parseGoalAmount(text); if (!amount) return null;
  let title = String(text).replace(/\d+(?:[.,]\d+)?/g,' ').replace(/\b20\d{2}\b/g,' ')
    .replace(/(?:عايز|أريد|اريد|نفسي|اعمل|أنشئ|انشئ|اضف|هدف|اوفر|أوفر|احوش|جنيه|جنية|قبل|بحلول|لحد|لسنة|سنة)/gi,' ')
    .replace(/\s+/g,' ').trim();
  title = title.replace(/(?:يناير|فبراير|مارس|ابريل|أبريل|مايو|يونيو|يوليو|اغسطس|أغسطس|سبتمبر|اكتوبر|أكتوبر|نوفمبر|ديسمبر).*$/i,'').trim();
  if (!title) title = 'هدف ادخار';
  return { title, targetAmount: amount, targetDate: parseGoalDate(text) };
}

function detectWalletType(name: string): Wallet['type'] {
  const n = normalizeArabicText(name);
  if (/فودافون|اورنج|اتصالات|وي باي|wallet|محفظه/.test(n)) return 'wallet';
  if (/cib|بنك|اهلي|مصر|qnb|alex|hsbc|bank/.test(n)) return 'bank';
  if (/فيزا|ماستر|كارت|بطاقه|card/.test(n)) return 'card';
  if (/ادخار|توفير|تحويش|savings/.test(n)) return 'savings';
  if (/كاش|نقد|cash/.test(n)) return 'cash';
  return 'wallet';
}

function detectCurrency(text: string): Currency {
  const n = normalizeArabicText(text);
  if (/دولار|usd/.test(n)) return 'USD';
  if (/ريال|sar/.test(n)) return 'SAR';
  if (/يورو|eur/.test(n)) return 'EUR';
  return 'EGP';
}

function parseWalletCreate(text: string): {
  name: string;
  balance: number;
  currency: Currency;
  type: Wallet['type'];
} | null {
  const normalized = normalizeArabicText(text);
  if (!/(اعمل|انشئ|اضف|افتح).*(محفظه|حساب)/.test(normalized)) return null;

  let name = '';
  const raw = String(text || '').trim();

  // NOTE: JavaScript \b is ASCII/word-character oriented and is unreliable
  // around Arabic text. Use an explicit Arabic-friendly lookahead instead.
  // Example:
  // "اعمل محفظة جديدة اسمها فودافون كاش ورصيدها 1000 جنيه"
  // => name = "فودافون كاش", balance = 1000
  const balanceBoundary =
    String.raw`(?=\s+(?:و\s*)?(?:رصيدها|رصيده|برصيد|رصيد)\s*(?:[:：-]?\s*)?\d|$)`;

  const nameMatch = raw.match(
    new RegExp(`(?:اسمها|اسمه|باسم)\\s+(.+?)${balanceBoundary}`, 'i')
  );
  if (nameMatch) name = nameMatch[1].trim();

  if (!name) {
    const fallback = raw.match(
      new RegExp(
        `(?:محفظة|محفظه|حساب)\\s+(?:جديدة|جديده|جديد)?\\s*(?:اسمها|اسمه|باسم)?\\s*(.+?)${balanceBoundary}`,
        'i'
      )
    );
    if (fallback) name = fallback[1].trim();
  }

  // Defensive cleanup for previously malformed phrases.
  name = name
    .replace(/^(جديده|جديدة|جديد)\s+/i, '')
    .replace(/\s+(?:و\s*)?(?:رصيدها|رصيده|برصيد|رصيد)\s*[:：-]?\s*\d.*$/i, '')
    .trim();
  if (!name || /^جديد[هة]?$/.test(name)) return null;

  const amount = parseAmount(text) ?? 0;
  const currency = detectCurrency(text);
  return { name, balance: amount, currency, type: detectWalletType(name) };
}

function parseWalletRename(text: string): { oldName: string; newName: string } | null {
  const raw = String(text || '').trim();
  const n = normalizeArabicText(raw);
  if (!/(غير|عدل|بدل).*(اسم).*(محفظه|حساب)/.test(n)) return null;
  const m = raw.match(/(?:محفظة|محفظه|حساب)\s+(.+?)\s+(?:إلى|الى|لـ|ل)\s+(.+)$/i);
  if (!m) return null;
  return { oldName: m[1].trim(), newName: m[2].trim() };
}

function parseWalletDelete(text: string): string | null {
  const raw = String(text || '').trim();
  const n = normalizeArabicText(raw);
  if (!/^(احذف|امسح|الغي|الغى).*(محفظه|حساب)/.test(n)) return null;
  const m = raw.match(/(?:محفظة|محفظه|حساب)\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function walletLabel(wallet: any): string {
  return `${wallet.nameAr || wallet.name || wallet.id} — ${formatMoney(Number(wallet.balance || 0))} ${wallet.currency || 'EGP'}${wallet.isPrimary ? ' — الأساسية' : ''}`;
}

async function resolveSingleWallet(userId: string, hint: string) {
  const match = await matchWalletByHint(userId, hint);
  if (match.ambiguous || !match.wallet) return null;
  return match.wallet;
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

  if (pending.actionType === 'v2_bill_select') {
    const num = Number(String(text).trim());
    const candidates = Array.isArray(pending.candidates) ? pending.candidates : [];
    const selected = Number.isInteger(num) ? candidates[num - 1] : null;
    if (!selected) {
      await sendMessage(chatId, `اكتب رقم فاتورة من 1 إلى ${candidates.length}، أو اكتب: إلغاء`);
      return { handled: true };
    }

    const bills = await billRepository.getBills(userId);
    const bill: any = bills.find((item: any) => String(item.id) === String(selected.billId));
    if (!bill || billRemainingAmount(bill) <= 0) {
      await ref.delete();
      await sendMessage(chatId, '⚠️ الفاتورة المختارة لم تعد مستحقة أو تم سدادها بالفعل.');
      return { handled: true };
    }

    const walletMatch = await matchWalletForUser(userId, String(pending.originalText || ''));
    if (walletMatch.ambiguous || !walletMatch.wallet) {
      await ref.delete();
      await sendMessage(chatId, '👛 مش قادر أحدد محفظة السداد بدقة. اكتب اسم المحفظة في طلب السداد وابعت العملية من جديد.');
      return { handled: true };
    }

    const remaining = billRemainingAmount(bill);
    const requested = pending.requestedAmount == null ? remaining : Number(pending.requestedAmount);
    if (!Number.isFinite(requested) || requested <= 0 || requested > remaining + 0.000001) {
      await ref.delete();
      await sendMessage(chatId, `⚠️ مبلغ السداد غير صالح. المتبقي على الفاتورة ${formatMoney(remaining)} ج.م.`);
      return { handled: true };
    }

    await savePending(telegramUserId, {
      actionType: 'v2_bill_payment',
      userId,
      chatId,
      billId: bill.id,
      billTitle: bill.titleAr || bill.title || 'فاتورة',
      amount: requested,
      remainingBefore: remaining,
      walletId: walletMatch.wallet.id,
      walletName: walletMatch.wallet.nameAr || walletMatch.wallet.name,
    });
    await sendMessage(
      chatId,
      `🧾 سداد فاتورة جاهز للتأكيد:\n\n${billLabel(bill)}\n\n💰 هتدفع: ${formatMoney(requested)} ج.م\n👛 من: ${walletMatch.wallet.nameAr || walletMatch.wallet.name}\n✅ المتبقي بعد السداد: ${formatMoney(Math.max(0, remaining - requested))} ج.م\n\nاكتب: تأكيد\nأو: إلغاء`
    );
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

    if (pending.actionType === 'v2_bill_payment') {
      const result = await executeBillPayment(userId, {
        billId: String(pending.billId),
        amount: Number(pending.amount),
        walletId: String(pending.walletId),
        paymentMethod: 'Cash',
        date: cairoDate(),
        idempotencyKey: `telegram-v2-bill-${telegramUserId}-${pending.createdAt}`,
        source: 'telegram',
      });
      await markBudgetStale(userId);
      await ref.delete();
      await sendMessage(
        chatId,
        `✅ تم سداد الفاتورة بنجاح.\n\n🧾 ${pending.billTitle || 'فاتورة'}\n💰 المدفوع: ${formatMoney(result.amount)} ج.م\n👛 من: ${result.walletName || pending.walletName}\n💵 رصيد المحفظة بعد السداد: ${formatMoney(result.newWalletBalance)} ج.م\n${result.isFullyPaid ? '✅ الفاتورة اتسددت بالكامل.' : `🟡 سداد جزئي — المتبقي: ${formatMoney(result.remainingAmount)} ج.م`}\n📊 تم تحديث الميزانية.`
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


    if (pending.actionType === 'v2_create_wallet') {
      const existing = await getWalletsForUser(userId);
      const wanted = normalizeArabicText(String(pending.name || ''));
      const duplicate = existing.find((wallet) =>
        [wallet.name, wallet.nameAr]
          .filter(Boolean)
          .some((value) => normalizeArabicText(String(value)) === wanted)
      );
      if (duplicate) {
        await ref.delete();
        await sendMessage(chatId, `⚠️ عندك محفظة بنفس الاسم بالفعل:\n${walletLabel(duplicate)}`);
        return { handled: true };
      }

      const wallet = await createWalletForUser(userId, {
        name: String(pending.name),
        nameAr: String(pending.name),
        type: pending.walletType || 'wallet',
        balance: Number(pending.balance || 0),
        currency: pending.currency || 'EGP',
        icon: 'Wallet',
        color: 'bg-emerald-600',
        isPrimary: existing.length === 0,
      } as any);
      await ref.delete();
      await sendMessage(
        chatId,
        `✅ تم إنشاء المحفظة بنجاح.\n\n👛 ${wallet.nameAr || wallet.name}\n💰 الرصيد الافتتاحي: ${formatMoney(Number(wallet.balance || 0))} ${wallet.currency}\n🏷️ النوع: ${wallet.type}${wallet.isPrimary ? '\n⭐ تم تعيينها كمحفظة أساسية' : ''}\n\nℹ️ الرصيد الافتتاحي لا يُحسب كمصروف أو دخل.`
      );
      return { handled: true };
    }

    if (pending.actionType === 'v2_rename_wallet') {
      const updated = await updateWalletForUser(userId, String(pending.walletId), {
        name: String(pending.newName),
        nameAr: String(pending.newName),
      });
      await ref.delete();
      if (!updated) {
        await sendMessage(chatId, '⚠️ المحفظة لم تعد موجودة.');
        return { handled: true };
      }
      await sendMessage(chatId, `✅ تم تغيير اسم المحفظة بنجاح.\n\n👛 الاسم الجديد: ${updated.nameAr || updated.name}`);
      return { handled: true };
    }

    if (pending.actionType === 'v2_delete_wallet') {
      const walletId = String(pending.walletId || '');
      const wallet = (await getWalletsForUser(userId)).find((w) => w.id === walletId);
      if (!wallet) {
        await ref.delete();
        await sendMessage(chatId, '⚠️ المحفظة لم تعد موجودة.');
        return { handled: true };
      }
      if (wallet.isPrimary) {
        await ref.delete();
        await sendMessage(chatId, '⚠️ لا يمكن حذف المحفظة الأساسية. غيّر المحفظة الأساسية من التطبيق أولًا.');
        return { handled: true };
      }
      if (Math.abs(Number(wallet.balance || 0)) > 0.000001) {
        await ref.delete();
        await sendMessage(chatId, `⚠️ لا يمكن حذف المحفظة لأن رصيدها ${formatMoney(Number(wallet.balance || 0))} ${wallet.currency}. صفّر الرصيد أو حوّله لمحفظة أخرى أولًا.`);
        return { handled: true };
      }
      const txCol = db.collection('users').doc(userId).collection('transactions');
      const [asSource, asDest] = await Promise.all([
        txCol.where('walletId', '==', walletId).limit(1).get(),
        txCol.where('destinationWalletId', '==', walletId).limit(1).get(),
      ]);
      const hasHistory = !asSource.empty || !asDest.empty;
      await archiveWalletForUser(userId, walletId);
      await ref.delete();
      await sendMessage(
        chatId,
        hasHistory
          ? `✅ تم أرشفة المحفظة ${wallet.nameAr || wallet.name} بنجاح مع الاحتفاظ بتاريخ العمليات.`
          : `✅ تم حذف/أرشفة المحفظة ${wallet.nameAr || wallet.name} بنجاح.`
      );
      return { handled: true };
    }

    if (pending.actionType === 'v2_create_goal') {
      const target = Number(pending.targetAmount || 0);
      const date = String(pending.targetDate || parseGoalDate(''));
      const goal = await goalRepository.saveGoal(userId, {
        id: '', title: String(pending.title), titleAr: String(pending.title), targetAmount: target,
        currentAmount: 0, targetDate: date, category: 'general', icon: 'Target', color: 'bg-emerald-500',
        monthlyTarget: goalMonthlyTarget(target, 0, date), riskLevel: 'Medium', successProbability: 80,
      } as any);
      await ref.delete();
      await sendMessage(chatId, `✅ تم إنشاء الهدف بنجاح.\n\n🎯 ${goal.titleAr || goal.title}\n💰 الهدف: ${formatMoney(goal.targetAmount)} ج.م\n📅 الموعد: ${goal.targetDate}\n🐷 المطلوب تقريبًا: ${formatMoney(goal.monthlyTarget)} ج.م شهريًا`);
      return { handled: true };
    }

    if (pending.actionType === 'v2_goal_contribution' || pending.actionType === 'v2_goal_withdraw') {
      const goal: any = await goalRepository.getGoal(userId, String(pending.goalId));
      if (!goal || goal.isArchived) throw new Error('الهدف لم يعد موجودًا.');
      const amount = Number(pending.amount || 0);
      const current = Number(goal.currentAmount || 0);
      const isWithdraw = pending.actionType === 'v2_goal_withdraw';
      if (isWithdraw && amount > current) throw new Error(`المبلغ أكبر من المدخر في الهدف (${formatMoney(current)} ج.م).`);
      const wallet = (await getWalletsForUser(userId)).find(w => w.id === String(pending.walletId));
      if (!wallet) throw new Error('المحفظة لم تعد موجودة.');
      if (!isWithdraw && Number(wallet.balance || 0) < amount) throw new Error('رصيد المحفظة غير كافٍ.');
      const tx = await transactionRepository.createTransaction(userId, {
        title: `${isWithdraw ? 'سحب من' : 'ادخار في'} هدف ${goal.titleAr || goal.title}`,
        amount, currency: wallet.currency || 'EGP', type: isWithdraw ? 'income' : 'expense',
        category: 'Emergency & Savings', walletId: wallet.id, paymentMethod: 'Cash', date: cairoDate(),
        notes: `Goal:${goal.id}`, aiTag: isWithdraw ? 'telegram-goal-withdraw' : 'telegram-goal-contribution',
      } as any);
      const newCurrent = Math.max(0, Math.min(Number(goal.targetAmount || 0), isWithdraw ? current - amount : current + amount));
      const updated: any = await goalRepository.updateGoal(userId, goal.id, {
        currentAmount: newCurrent,
        monthlyTarget: goalMonthlyTarget(Number(goal.targetAmount || 0), newCurrent, String(goal.targetDate)),
        lastContributionTransactionId: tx.id,
      });
      await markBudgetStale(userId); await ref.delete();
      await sendMessage(chatId, `✅ ${isWithdraw ? 'تم السحب من الهدف' : 'تمت إضافة الادخار للهدف'} بنجاح.\n\n🎯 ${updated.titleAr || updated.title}\n💰 الحالي: ${formatMoney(updated.currentAmount)} / ${formatMoney(updated.targetAmount)} ج.م\n👛 ${isWithdraw ? 'تمت الإضافة إلى' : 'تم الخصم من'}: ${wallet.nameAr || wallet.name}`);
      return { handled: true };
    }

    if (pending.actionType === 'v2_edit_goal') {
      const goal: any = await goalRepository.getGoal(userId, String(pending.goalId));
      if (!goal) throw new Error('الهدف لم يعد موجودًا.');
      const target = Number(pending.targetAmount || goal.targetAmount);
      const date = String(pending.targetDate || goal.targetDate);
      const updated: any = await goalRepository.updateGoal(userId, goal.id, {
        targetAmount: target, targetDate: date,
        monthlyTarget: goalMonthlyTarget(target, Number(goal.currentAmount || 0), date),
      });
      await ref.delete();
      await sendMessage(chatId, `✅ تم تعديل الهدف.\n\n🎯 ${goalLabel(updated)}\n📅 ${updated.targetDate}\n🐷 المطلوب شهريًا: ${formatMoney(updated.monthlyTarget)} ج.م`);
      return { handled: true };
    }

    if (pending.actionType === 'v2_delete_goal') {
      const goal: any = await goalRepository.getGoal(userId, String(pending.goalId));
      if (!goal) throw new Error('الهدف لم يعد موجودًا.');
      await goalRepository.archiveGoal(userId, goal.id); await ref.delete();
      await sendMessage(chatId, `🗑️ تم حذف/أرشفة الهدف: ${goal.titleAr || goal.title}\n\nتقدر تقول: رجع آخر هدف محذوف`);
      return { handled: true };
    }

    if (pending.actionType === 'v2_restore_goal') {
      const goal: any = await goalRepository.restoreGoal(userId, String(pending.goalId));
      if (!goal) throw new Error('الهدف لم يعد موجودًا.');
      await ref.delete(); await sendMessage(chatId, `♻️ تم استرجاع الهدف بنجاح: ${goalLabel(goal)}`);
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
    const bills = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).filter((b) => billRemainingAmount(b) > 0);
    const total = bills.reduce((s, b) => s + billRemainingAmount(b), 0);
    await sendMessage(
      chatId,
      bills.length
        ? `🧾 عندك ${bills.length} فاتورة غير مدفوعة بإجمالي ${formatMoney(total)} ج.م:\n\n${bills.slice(0, 8).map((b, i) => `${i + 1}. ${b.titleAr || b.title || 'فاتورة'} — متبقي ${formatMoney(billRemainingAmount(b))} ج.م — ${b.dueDate || '-'}`).join('\n')}`
        : '✅ مفيش فواتير غير مدفوعة حاليًا.'
    );
    return { handled: true };
  }

  if (/الفواتير اللي قربت|فواتير قربت|فواتير قريبه|فاتوره قربت/.test(n)) {
    const snap = await db.collection('users').doc(userId).collection('bills').get();
    const todayTime = new Date(`${today}T00:00:00Z`).getTime();
    const bills = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((b) => billRemainingAmount(b) > 0 && b.dueDate)
      .map((b) => ({ ...b, days: Math.ceil((new Date(`${b.dueDate}T00:00:00Z`).getTime() - todayTime) / 86400000) }))
      .filter((b) => b.days >= 0 && b.days <= 7)
      .sort((a, b) => a.days - b.days);
    await sendMessage(
      chatId,
      bills.length
        ? `⏰ الفواتير المستحقة خلال 7 أيام:\n\n${bills.map((b) => `• ${b.titleAr || b.title} — متبقي ${formatMoney(billRemainingAmount(b))} ج.م — بعد ${b.days} يوم`).join('\n')}`
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

  // Safe-to-spend aliases: answer the user's total available amount, not only the daily allowance.
  if (/اقدر اصرف كام النهارده|اصرف كام النهارده|المتاح ليا اصرفه كام|المتاح اصرفه كام|فاضل اصرف كام|فاضلي اصرف كام|اقدر اصرف كام$/.test(n)) {
    const context = await getTrustedFinancialContext(userId);
    const safe = Number(context.safeToSpend || 0);
    const day = Number(today.slice(8, 10));
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const remainingDays = Math.max(1, days - day + 1);
    await sendMessage(chatId, `✅ المتاح الآمن المتبقي: ${formatMoney(safe)} ج.م\n📅 متوسط آمن تقريبي لباقي الشهر: ${formatMoney(safe / remainingDays)} ج.م يوميًا.`);
    return { handled: true };
  }

  // Month-end forecast. This is deliberately separate from the current-wallet-balance query.
  if (/فلوسي هتكفيني|يكفيني لاخر الشهر|متوقع يتبقي|متوقع يتبقى|توقع رصيدي اخر الشهر|رصيدي اخر الشهر|هيتبقي معايا كام اخر الشهر|هيتبقى معايا كام اخر الشهر/.test(n)) {
    const context = await getTrustedFinancialContext(userId);
    const txs = (await loadTransactions(userId)).filter((tx) => tx.type === 'expense' && String(tx.date || '').startsWith(monthKey));
    const spent = txs.reduce((s, tx) => s + Number(tx.amount || 0), 0);
    const day = Math.max(1, Number(today.slice(8, 10)));
    const [y, m] = monthKey.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const remainingDays = Math.max(0, days - day);
    const dailyBurn = spent / day;
    const projectedRemainingFlexibleSpend = dailyBurn * remainingDays;
    const commitments = Number(context.outstandingMonthlyCommitments || 0) + Number(context.unpaidBillsThisMonthTotal || 0);
    const currentWalletBalance = (context.wallets || []).filter((w: any) => (w.currency || 'EGP') === 'EGP').reduce((sum: number, w: any) => sum + Number(w.balance || 0), 0);
    const projectedWalletBalance = currentWalletBalance - projectedRemainingFlexibleSpend - commitments;
    const budgetProjection = Number((context.currentBudget as any)?.projectedEndOfMonthBalance ?? (context.currentBudget as any)?.projectedMonthEndBalance);
    const hasBudgetProjection = Number.isFinite(budgetProjection);
    await sendMessage(chatId, `🔮 توقع رصيدك آخر الشهر:\n\n👛 رصيد المحافظ الحالي: ${formatMoney(currentWalletBalance)} ج.م\n📉 صرف متوقع لباقي الشهر: ${formatMoney(projectedRemainingFlexibleSpend)} ج.م\n📌 فواتير والتزامات متبقية: ${formatMoney(commitments)} ج.م\n💰 الرصيد المتوقع: ${formatMoney(projectedWalletBalance)} ج.م${hasBudgetProjection ? `\n📊 توقع الميزانية المحفوظ: ${formatMoney(budgetProjection)} ج.م` : ''}\n\n${projectedWalletBalance >= 0 ? '✅ بالمعدل الحالي، رصيدك متوقع يفضل موجب.' : '⚠️ بالمعدل الحالي، فيه احتمال عجز قبل نهاية الشهر.'}`);
    return { handled: true };
  }

  // Goals are real Firestore data; never fall through to the generic help message.
  if (/^اهدافي$|^الاهداف$|اعرض اهدافي|وريني اهدافي|اهداف الادخار|اهداف التوفير/.test(n)) {
    const context = await getTrustedFinancialContext(userId);
    const goals = Array.isArray(context.goals) ? context.goals : [];
    if (!goals.length) {
      await sendMessage(chatId, '🎯 مفيش أهداف مالية مسجلة حاليًا.\n\nتقدر تضيف هدف من قسم الأهداف في التطبيق، وبعدها هتابع تقدمه معاك هنا.');
      return { handled: true };
    }
    const lines = goals.slice(0, 10).map((goal: any, index: number) => {
      const target = Math.max(0, Number(goal.targetAmount || 0));
      const current = Math.max(0, Number(goal.currentAmount || 0));
      const remaining = Math.max(0, target - current);
      const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
      const monthly = goalMonthlyTarget(target, current, String(goal.targetDate || parseGoalDate('')));
      return `${index + 1}. ${goal.titleAr || goal.title || 'هدف مالي'}\n   💰 ${formatMoney(current)} / ${formatMoney(target)} ج.م — ${percent}%\n   🎯 المتبقي: ${formatMoney(remaining)} ج.م${goal.targetDate ? ` — 📅 ${goal.targetDate}` : ''}\n   🐷 المطلوب تقريبًا: ${formatMoney(monthly)} ج.م شهريًا`;
    });
    await sendMessage(chatId, `🎯 أهدافك المالية:\n\n${lines.join('\n\n')}`);
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

  if (n === '/help' || /^(مساعده|المساعده|تقدر تعمل ايه|تقدر تعمل ايه دلوقتي)$/.test(n)) {
    await sendMessage(
      chatId,
      `🤖 Mizaniya AI — الأوامر المالية المتاحة:\n\n💸 مصروف ودخل\n• اشتريت أكل بـ250 جنيه من الكاش\n• قبضت مكافأة 500 جنيه على فودافون كاش\n\n🧾 الفواتير\n• أضف فاتورة كهرباء 500 جنيه يوم 20\n• دفعت فاتورة الكهرباء 200 جنيه من الكاش\n• عليا كام فواتير؟\n• الفواتير اللي قربت\n\n👛 المحافظ\n• اعمل محفظة اسمها فودافون كاش ورصيدها 1000 جنيه\n• اعرض محافظي\n• حول 200 من الكاش إلى فودافون كاش\n• غير اسم محفظة ... إلى ...\n\n✏️ إدارة العمليات\n• عدل آخر مصروف وخليه 30 جنيه\n• احذف آخر مصروف\n• رجع آخر عملية محذوفة\n• آخر 5 عمليات\n\n📊 التحليل\n• ملخص النهاردة / الأسبوع / الشهر\n• أكتر حاجة صرفت عليها إيه؟\n• فاضلي كام من ميزانية الأكل؟\n• أقدر أصرف كام النهاردة؟\n• فلوسي هتكفيني لآخر الشهر؟\n\n🐷 الادخار\n• عايز أوفر 2000 الشهر ده\n• أوفر كام في اليوم؟\n• هدف التوفير واقعي؟\n\n🎙️ تقدر تبعت Voice بعملية مالية.\n📷 وتقدر تبعت صورة إيصال، ولو عايز محفظة معينة اكتب اسمها في Caption.\n\n🔐 أي عملية تغيّر فلوسك بتحتاج تأكيد قبل التنفيذ.`
    );
    return { handled: true };
  }

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


  if (/^(اعرض|وريني|هات|اظهر).*محافظ|محافظي|رصيد المحافظ|ارصده المحافظ/.test(n)) {
    const wallets = await getWalletsForUser(userId);
    if (!wallets.length) {
      await sendMessage(chatId, '👛 مفيش محافظ مسجلة حاليًا.');
      return { handled: true };
    }
    const totalEgp = wallets
      .filter((w) => w.currency === 'EGP')
      .reduce((sum, w) => sum + Number(w.balance || 0), 0);
    await sendMessage(
      chatId,
      `👛 محافظك:\n\n${wallets.map((w, i) => `${i + 1}. ${walletLabel(w)}`).join('\n')}\n\n💰 إجمالي محافظ EGP: ${formatMoney(totalEgp)} ج.م`
    );
    return { handled: true };
  }

  const walletCreate = parseWalletCreate(text);
  if (walletCreate) {
    const wallets = await getWalletsForUser(userId);
    const duplicate = wallets.find((wallet) =>
      [wallet.name, wallet.nameAr]
        .filter(Boolean)
        .some((value) => normalizeArabicText(String(value)) === normalizeArabicText(walletCreate.name))
    );
    if (duplicate) {
      await sendMessage(chatId, `⚠️ عندك محفظة بنفس الاسم بالفعل:\n${walletLabel(duplicate)}`);
      return { handled: true };
    }
    await savePending(telegramUserId, {
      actionType: 'v2_create_wallet',
      userId,
      chatId,
      name: walletCreate.name,
      balance: walletCreate.balance,
      currency: walletCreate.currency,
      walletType: walletCreate.type,
    });
    await sendMessage(
      chatId,
      `👛 إنشاء محفظة جاهز للتأكيد:\n\n📝 الاسم: ${walletCreate.name}\n🏷️ النوع: ${walletCreate.type}\n💰 الرصيد الافتتاحي: ${formatMoney(walletCreate.balance)} ${walletCreate.currency}\n\nℹ️ الرصيد الافتتاحي لن يُحسب كدخل أو مصروف.\n\nاكتب: تأكيد\nأو: إلغاء`
    );
    return { handled: true };
  }

  const walletRename = parseWalletRename(text);
  if (walletRename) {
    const wallet = await resolveSingleWallet(userId, walletRename.oldName);
    if (!wallet) {
      await sendMessage(chatId, '👛 مش قادر أحدد المحفظة المراد تغيير اسمها. اكتب اسمها الحالي كما هو مسجل.');
      return { handled: true };
    }
    if (!walletRename.newName.trim()) {
      await sendMessage(chatId, '⚠️ الاسم الجديد غير صالح.');
      return { handled: true };
    }
    await savePending(telegramUserId, {
      actionType: 'v2_rename_wallet', userId, chatId,
      walletId: wallet.id, oldName: wallet.nameAr || wallet.name, newName: walletRename.newName,
    });
    await sendMessage(chatId, `✏️ تغيير اسم المحفظة جاهز:\n\nمن: ${wallet.nameAr || wallet.name}\nإلى: ${walletRename.newName}\n\nاكتب: تأكيد\nأو: إلغاء`);
    return { handled: true };
  }

  const walletDeleteHint = parseWalletDelete(text);
  if (walletDeleteHint) {
    const wallet = await resolveSingleWallet(userId, walletDeleteHint);
    if (!wallet) {
      await sendMessage(chatId, '👛 مش قادر أحدد المحفظة المراد حذفها.');
      return { handled: true };
    }
    if (wallet.isPrimary) {
      await sendMessage(chatId, '⚠️ لا يمكن حذف المحفظة الأساسية.');
      return { handled: true };
    }
    if (Math.abs(Number(wallet.balance || 0)) > 0.000001) {
      await sendMessage(chatId, `⚠️ المحفظة رصيدها ${formatMoney(Number(wallet.balance || 0))} ${wallet.currency}. لازم تصفّر الرصيد أو تحوله الأول.`);
      return { handled: true };
    }
    await savePending(telegramUserId, {
      actionType: 'v2_delete_wallet', userId, chatId, walletId: wallet.id,
      walletName: wallet.nameAr || wallet.name,
    });
    await sendMessage(chatId, `🗑️ حذف محفظة جاهز للتأكيد:\n\n👛 ${wallet.nameAr || wallet.name}\n\nلن يتم الحذف إذا كان لها سجل عمليات.\n\nاكتب: تأكيد\nأو: إلغاء`);
    return { handled: true };
  }

  const billPaymentRequest = parseBillPaymentRequest(text);
  if (billPaymentRequest) {
    const bills = await findBillCandidates(userId, billPaymentRequest.titleHint);
    if (!bills.length) {
      await sendMessage(chatId, '🧾 ملقتش فاتورة غير مدفوعة مطابقة للطلب. قول: عليا كام فواتير؟ عشان تشوف الفواتير الحالية.');
      return { handled: true };
    }

    const walletMatch = await matchWalletForUser(userId, text);
    if (walletMatch.ambiguous || !walletMatch.wallet) {
      await sendMessage(chatId, '👛 مش قادر أحدد محفظة السداد بدقة. اكتب اسم المحفظة كما هو مسجل، مثال: دفعت فاتورة الكهرباء 200 جنيه من الكاش.');
      return { handled: true };
    }

    if (bills.length > 1) {
      await savePending(telegramUserId, {
        actionType: 'v2_bill_select',
        userId,
        chatId,
        requestedAmount: billPaymentRequest.amount ?? null,
        originalText: text,
        candidates: bills.map((bill: any) => ({ billId: bill.id, label: billLabel(bill) })),
      });
      await sendMessage(
        chatId,
        `🧾 لقيت أكتر من فاتورة مطابقة:\n\n${bills.map((bill: any, i: number) => `${i + 1}. ${billLabel(bill)}`).join('\n')}\n\nاكتب رقم الفاتورة، أو اكتب: إلغاء`
      );
      return { handled: true };
    }

    const bill: any = bills[0];
    const remaining = billRemainingAmount(bill);
    const requested = billPaymentRequest.amount ?? remaining;
    if (requested > remaining + 0.000001) {
      await sendMessage(chatId, `⚠️ طلبت سداد ${formatMoney(requested)} ج.م لكن المتبقي على الفاتورة ${formatMoney(remaining)} ج.م فقط.`);
      return { handled: true };
    }

    await savePending(telegramUserId, {
      actionType: 'v2_bill_payment',
      userId,
      chatId,
      billId: bill.id,
      billTitle: bill.titleAr || bill.title || 'فاتورة',
      amount: requested,
      remainingBefore: remaining,
      walletId: walletMatch.wallet.id,
      walletName: walletMatch.wallet.nameAr || walletMatch.wallet.name,
    });
    await sendMessage(
      chatId,
      `🧾 سداد فاتورة جاهز للتأكيد:\n\n${billLabel(bill)}\n\n💰 هتدفع: ${formatMoney(requested)} ج.م\n👛 من: ${walletMatch.wallet.nameAr || walletMatch.wallet.name}\n✅ المتبقي بعد السداد: ${formatMoney(Math.max(0, remaining - requested))} ج.م\n\nاكتب: تأكيد\nأو: إلغاء`
    );
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
    if (Number(sourceMatch.wallet.balance || 0) < transfer.amount) {
      await sendMessage(chatId, `⚠️ رصيد محفظة ${sourceMatch.wallet.nameAr || sourceMatch.wallet.name} غير كافٍ للتحويل.\n\n💰 الرصيد الحالي: ${formatMoney(Number(sourceMatch.wallet.balance || 0))} ${sourceMatch.wallet.currency || 'EGP'}\n🔄 المبلغ المطلوب: ${formatMoney(transfer.amount)} ${sourceMatch.wallet.currency || 'EGP'}`);
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

  const createGoal = parseGoalCreate(text);
  if (createGoal) {
    await savePending(telegramUserId, { actionType: 'v2_create_goal', userId, chatId, ...createGoal });
    await sendMessage(chatId, `🎯 هدف جديد جاهز للتأكيد:\n\n📝 ${createGoal.title}\n💰 ${formatMoney(createGoal.targetAmount)} ج.م\n📅 ${createGoal.targetDate}\n🐷 المطلوب تقريبًا: ${formatMoney(goalMonthlyTarget(createGoal.targetAmount, 0, createGoal.targetDate))} ج.م شهريًا\n\nاكتب: تأكيد\nأو: إلغاء`);
    return { handled: true };
  }

  if (/(زود|حط|ضيف|ادخر|حوش|وفرت|حطيت).*(هدف)/.test(n) || /(هدف).*(زود|حط|ضيف|ادخر|حوش|وفرت)/.test(n)) {
    const amount = parseAmount(text); if (!amount) { await sendMessage(chatId, 'حدد المبلغ، مثال: حط 500 جنيه في هدف العربية من الكاش'); return { handled:true }; }
    const goals = await findGoalCandidates(userId, text); if (goals.length !== 1) { await sendMessage(chatId, goals.length ? `🎯 حدد الهدف بدقة:\n${goals.map((g:any,i:number)=>`${i+1}. ${goalLabel(g)}`).join('\n')}` : '🎯 ملقتش هدف مطابق.'); return { handled:true }; }
    const walletMatch = await matchWalletForUser(userId, text); if (walletMatch.ambiguous || !walletMatch.wallet) { await sendMessage(chatId, '👛 اكتب المحفظة بوضوح، مثال: حط 500 في هدف العربية من الكاش'); return { handled:true }; }
    await savePending(telegramUserId, { actionType:'v2_goal_contribution', userId, chatId, goalId:goals[0].id, amount, walletId:walletMatch.wallet.id });
    await sendMessage(chatId, `🐷 إضافة ادخار جاهزة:\n\n🎯 ${goals[0].titleAr || goals[0].title}\n💰 ${formatMoney(amount)} ج.م\n👛 من: ${walletMatch.wallet.nameAr || walletMatch.wallet.name}\n\nاكتب: تأكيد\nأو: إلغاء`); return { handled:true };
  }

  if (/(اسحب|خد|ارجع).*(هدف)/.test(n)) {
    const amount = parseAmount(text); if (!amount) { await sendMessage(chatId, 'حدد مبلغ السحب من الهدف.'); return { handled:true }; }
    const goals = await findGoalCandidates(userId, text); if (goals.length !== 1) { await sendMessage(chatId, goals.length ? `🎯 حدد الهدف بدقة:\n${goals.map((g:any,i:number)=>`${i+1}. ${goalLabel(g)}`).join('\n')}` : '🎯 ملقتش هدف مطابق.'); return { handled:true }; }
    const walletMatch = await matchWalletForUser(userId, text); if (walletMatch.ambiguous || !walletMatch.wallet) { await sendMessage(chatId, '👛 اكتب محفظة الاستلام بوضوح، مثال: اسحب 200 من هدف العربية للكاش'); return { handled:true }; }
    await savePending(telegramUserId, { actionType:'v2_goal_withdraw', userId, chatId, goalId:goals[0].id, amount, walletId:walletMatch.wallet.id });
    await sendMessage(chatId, `↩️ سحب من هدف جاهز:\n\n🎯 ${goals[0].titleAr || goals[0].title}\n💰 ${formatMoney(amount)} ج.م\n👛 إلى: ${walletMatch.wallet.nameAr || walletMatch.wallet.name}\n\nاكتب: تأكيد\nأو: إلغاء`); return { handled:true };
  }

  if (/^(عدل|غير).*(هدف)/.test(n)) {
    const goals = await findGoalCandidates(userId, text); if (goals.length !== 1) { await sendMessage(chatId, '🎯 اكتب اسم الهدف بوضوح علشان أعدله.'); return { handled:true }; }
    const amount = parseGoalAmount(text) || Number(goals[0].targetAmount); const date = /20\d{2}|يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر/.test(n) ? parseGoalDate(text) : goals[0].targetDate;
    await savePending(telegramUserId, { actionType:'v2_edit_goal', userId, chatId, goalId:goals[0].id, targetAmount:amount, targetDate:date });
    await sendMessage(chatId, `✏️ تعديل هدف جاهز:\n\n🎯 ${goals[0].titleAr || goals[0].title}\n💰 الهدف الجديد: ${formatMoney(amount)} ج.م\n📅 الموعد: ${date}\n\nاكتب: تأكيد\nأو: إلغاء`); return { handled:true };
  }

  if (/^(احذف|امسح|الغي).*(هدف)/.test(n)) {
    const goals = await findGoalCandidates(userId, text); if (goals.length !== 1) { await sendMessage(chatId, '🎯 اكتب اسم الهدف بوضوح علشان أحذفه.'); return { handled:true }; }
    await savePending(telegramUserId, { actionType:'v2_delete_goal', userId, chatId, goalId:goals[0].id });
    await sendMessage(chatId, `🗑️ حذف هدف جاهز:\n\n${goalLabel(goals[0])}\n\nاكتب: تأكيد\nأو: إلغاء`); return { handled:true };
  }

  if (/رجع اخر هدف محذوف|استرجع اخر هدف محذوف/.test(n)) {
    const all:any[] = await goalRepository.getGoals(userId, true); const archived = all.filter((g:any)=>g.isArchived).sort((a:any,b:any)=>String(b.archivedAt||'').localeCompare(String(a.archivedAt||'')));
    if (!archived.length) { await sendMessage(chatId, 'مفيش أهداف محذوفة قابلة للاسترجاع.'); return { handled:true }; }
    await savePending(telegramUserId, { actionType:'v2_restore_goal', userId, chatId, goalId:archived[0].id });
    await sendMessage(chatId, `♻️ استرجاع هدف جاهز:\n\n${goalLabel(archived[0])}\n\nاكتب: تأكيد\nأو: إلغاء`); return { handled:true };
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
