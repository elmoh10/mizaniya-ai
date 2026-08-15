import { transactionRepository } from '../repositories/transactionRepository';
import { buildSmartFinancialInsights } from './smartFinancialInsightsService';
import type { Challenge } from '../../types';

const dateOnly = (v: any) => String(v || '').slice(0, 10);
const cairoToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

function addDays(date: string, delta: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function clampPct(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export async function buildFinancialChallenges(userId: string): Promise<Challenge[]> {
  const [insights, rawTransactions] = await Promise.all([
    buildSmartFinancialInsights(userId),
    transactionRepository.getTransactions(userId),
  ]);

  const txs: any[] = (rawTransactions as any[] || []).filter((t) => !t.isDeleted);
  const today = cairoToday();
  const monthKey = today.slice(0, 7);

  // Challenge 1: Keep daily spending under the safe daily limit for 7 days.
  const dailyExpenses = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    const d = dateOnly(t.date);
    if (!d) continue;
    dailyExpenses.set(d, (dailyExpenses.get(d) || 0) + Number(t.amount || 0));
  }

  let disciplinedDays = 0;
  const safeDaily = Number(insights.safeDaily || 0);
  if (safeDaily > 0) {
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(today, -i);
      if ((dailyExpenses.get(d) || 0) <= safeDaily) disciplinedDays += 1;
    }
  }

  // Challenge 2: Keep Shopping & Entertainment at or below 15% of monthly income.
  const flexibleCategorySpend = txs
    .filter((t) => t.type === 'expense' && String(t.date || '').startsWith(monthKey) && t.category === 'Shopping & Entertainment')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const income = Number(insights.income || 0);
  const flexCap = income > 0 ? income * 0.15 : 0;
  const flexProgress = flexCap > 0
    ? clampPct(100 - Math.max(0, flexibleCategorySpend - flexCap) / flexCap * 100)
    : 0;

  // Challenge 3: Build a 20% monthly saving rate using verified cash-flow data.
  const savingsRate = Math.max(0, Number(insights.savingsRatePercent || 0));
  const savingsProgress = clampPct((savingsRate / 20) * 100);

  return [
    {
      id: 'safe-spend-7d',
      title: '7-Day Safe Spend',
      titleAr: '7 أيام صرف آمن',
      description: safeDaily > 0
        ? `Stay at or below ${Math.round(safeDaily)} EGP per day for 7 days.`
        : 'Generate a monthly budget first to calculate your safe daily limit.',
      durationDays: 7,
      rewardPoints: 120,
      badgeIcon: 'PiggyBank',
      currentProgressPercent: safeDaily > 0 ? clampPct((disciplinedDays / 7) * 100) : 0,
      isCompleted: safeDaily > 0 && disciplinedDays === 7,
    },
    {
      id: 'flexible-spend-control',
      title: 'Flexible Spend Control',
      titleAr: 'تحكم في الصرف المرن',
      description: income > 0
        ? `Keep Shopping & Entertainment within 15% of monthly income (${Math.round(flexCap)} EGP).`
        : 'Register monthly income to activate this challenge.',
      durationDays: 30,
      rewardPoints: 180,
      badgeIcon: 'Coffee',
      currentProgressPercent: flexProgress,
      isCompleted: flexCap > 0 && flexibleCategorySpend <= flexCap,
    },
    {
      id: 'savings-rate-20',
      title: '20% Savings Builder',
      titleAr: 'تحدي ادخار 20%',
      description: 'Reach a 20% monthly savings rate based on real income and expenses.',
      durationDays: 30,
      rewardPoints: 250,
      badgeIcon: 'PiggyBank',
      currentProgressPercent: savingsProgress,
      isCompleted: savingsRate >= 20,
    },
  ];
}
