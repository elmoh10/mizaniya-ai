import { db } from '../config/firebaseAdmin';
import { Wallet, Transaction, Budget, Goal, Bill, InstallmentDebt } from '../../types';

export interface TrustedFinancialContext {
  userId: string;
  userProfile?: any;
  salary: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyBills: number;
  monthlyInstallments: number;
  monthlySavings: number;
  availableBalance: number;
  walletBalances: Array<{ name: string; balance: number; currency: string }>;
  categorySpending: Record<string, number>;
  activeGoals: Array<{
    title: string;
    targetAmount: number;
    currentAmount: number;
    monthlyTarget: number;
    successProbability: number;
  }>;
  activeInstallments: InstallmentDebt[];
  activeInstallmentsList: Array<{
    title: string;
    remainingAmount: number;
    monthlyPayment: number;
    provider: string;
  }>;
  wallets: Wallet[];
  totalWalletBalance: number;
  recentTransactions: Transaction[];
  currentBudget?: Budget;
  goals: Goal[];
  bills: Bill[];
  unpaidBills: Bill[];
  unpaidBillsTotal: number;
  installments: InstallmentDebt[];
  installmentDebtTotal: number;
  monthlyInstallmentObligation: number;
  debtsTotal: number;
  monthlySurplus: number;
  historicalIncomeStability: {
    calculatedScore: number;
    monthCount: number;
    monthlyAverage: number;
    coefficientOfVariation: number;
    status: 'CALCULATED' | 'INSUFFICIENT_DATA';
  };
  aiMemories?: any[];
  dataStatus?: {
    incomeAvailable: boolean;
    transactionsAvailable: boolean;
  };
  debts?: any[];
}

export async function getTrustedFinancialContext(userId: string): Promise<TrustedFinancialContext> {
  const userDocRef = db.collection('users').doc(userId);
  const monthKey = new Date().toISOString().slice(0, 7);

  const [
    userDoc,
    walletsSnap,
    txsSnap,
    budgetDoc,
    goalsSnap,
    billsSnap,
    installmentsSnap,
    debtsSnap,
    memoriesSnap,
  ] = await Promise.all([
    userDocRef.get(),
    userDocRef.collection('wallets').get(),
    userDocRef.collection('transactions').orderBy('date', 'desc').limit(100).get(),
    userDocRef.collection('budgets').doc(monthKey).get(),
    userDocRef.collection('goals').get(),
    userDocRef.collection('bills').get(),
    userDocRef.collection('installments').get(),
    userDocRef.collection('debts').get(),
    userDocRef.collection('ai_memories').get(),
  ]);

  const userProfile = userDoc.exists ? userDoc.data() : {};
  const wallets = walletsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Wallet));
  const recentTransactions = txsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Transaction & { isDeleted?: boolean }))
    .filter((tx) => !tx.isDeleted);
  const currentBudget = budgetDoc.exists ? (budgetDoc.data() as Budget) : undefined;
  const goals = goalsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Goal));
  const bills = billsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Bill));
  const installments = installmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as InstallmentDebt));
  const debts = debtsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const aiMemories = memoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const salary = Number(userProfile?.salary || currentBudget?.totalSalary || currentBudget?.totalIncome || 0);
  const totalWalletBalance = wallets.reduce((acc, w) => acc + (w.balance || 0), 0);

  // Separate Bills from Debt Installments
  const unpaidBills = bills.filter((b) => !b.isPaid);
  const unpaidBillsTotal = unpaidBills.reduce((acc, b) => acc + (b.amount || 0), 0);

  const activeInstallments = installments.filter((i) => i.status === 'ACTIVE');
  const installmentDebtTotal = activeInstallments.reduce((acc, i) => acc + (i.remainingAmount || 0), 0);
  const activeDebtsTotal = debts.filter((d: any) => d.status === 'ACTIVE' || d.status === 'active').reduce((acc, d: any) => acc + (d.remainingAmount || 0), 0);

  const monthlyInstallmentObligation = activeInstallments.reduce((acc, i) => acc + (i.monthlyPayment || 0), 0) +
    debts.filter((d: any) => d.status === 'ACTIVE' || d.status === 'active').reduce((acc, d: any) => acc + (d.minimumPayment || 0), 0);

  // Backward compatible total debts
  const debtsTotal = installmentDebtTotal + activeDebtsTotal;

  const currentMonthExpenses = recentTransactions
    .filter((tx) => tx.type === 'expense' && (tx.date || '').startsWith(monthKey))
    .reduce((acc, tx) => acc + (tx.amount || 0), 0);

  // Deterministic monthly properties
  const monthlyIncome = salary;
  const monthlyExpenses = currentMonthExpenses;
  const monthlyBills = bills
    .filter((b) => (b.dueDate || '').startsWith(monthKey))
    .reduce((acc, b) => acc + (b.amount || 0), 0);
  const monthlyInstallments = monthlyInstallmentObligation;
  
  const monthlySavings = recentTransactions
    .filter((tx) => tx.type === 'expense' && tx.category === 'Emergency & Savings' && (tx.date || '').startsWith(monthKey))
    .reduce((acc, tx) => acc + (tx.amount || 0), 0);

  // Avoid double counting
  const paidInstallmentsThisMonth = recentTransactions
    .filter((tx) => tx.type === 'expense' && tx.category === 'Installments & Debt' && (tx.date || '').startsWith(monthKey))
    .reduce((acc, tx) => acc + (tx.amount || 0), 0);
  const remainingInstallmentObligation = Math.max(0, monthlyInstallmentObligation - paidInstallmentsThisMonth);
  const unpaidBillsThisMonthTotal = bills
    .filter((b) => !b.isPaid && (b.dueDate || '').startsWith(monthKey))
    .reduce((acc, b) => acc + (b.amount || 0), 0);

  const availableBalance = Math.max(0, salary - currentMonthExpenses - unpaidBillsThisMonthTotal - remainingInstallmentObligation);

  const walletBalances = wallets.map((w) => ({
    name: w.nameAr || w.name,
    balance: w.balance || 0,
    currency: w.currency || 'EGP',
  }));

  const categorySpending: Record<string, number> = {};
  recentTransactions
    .filter((tx) => tx.type === 'expense' && (tx.date || '').startsWith(monthKey))
    .forEach((tx) => {
      categorySpending[tx.category] = (categorySpending[tx.category] || 0) + (tx.amount || 0);
    });

  const activeGoals = goals.map((g) => ({
    title: g.titleAr || g.title,
    targetAmount: g.targetAmount,
    currentAmount: g.currentAmount,
    monthlyTarget: g.monthlyTarget,
    successProbability: g.successProbability,
  }));

  const activeInstallmentsList = activeInstallments.map((i) => ({
    title: i.titleAr || i.title,
    remainingAmount: i.remainingAmount,
    monthlyPayment: i.monthlyPayment,
    provider: i.provider,
  }));

  const currentMonthTxs = recentTransactions.filter((tx) => (tx.date || '').startsWith(monthKey));
  const dataStatus = {
    incomeAvailable: salary > 0,
    transactionsAvailable: currentMonthTxs.length > 0,
  };

  const monthlySurplus = Math.max(0, salary - currentMonthExpenses - monthlyInstallmentObligation - unpaidBillsTotal);

  // Historical Income Stability Analysis (3-6 Months)
  const incomeTxs = recentTransactions.filter((tx) => tx.type === 'income');
  const monthlyIncomeMap: Record<string, number> = {};
  incomeTxs.forEach((tx) => {
    const key = (tx.date || '').slice(0, 7);
    if (key) {
      monthlyIncomeMap[key] = (monthlyIncomeMap[key] || 0) + (tx.amount || 0);
    }
  });

  const incomeMonths = Object.keys(monthlyIncomeMap);
  let historicalIncomeStability = {
    calculatedScore: salary > 0 ? 75 : 50,
    monthCount: incomeMonths.length,
    monthlyAverage: salary,
    coefficientOfVariation: 0,
    status: (salary > 0 || incomeMonths.length > 0) ? ('CALCULATED' as const) : ('INSUFFICIENT_DATA' as const),
  };

  if (incomeMonths.length >= 2) {
    const amounts = Object.values(monthlyIncomeMap);
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 1;

    // Convert CV to Stability Score: 0 CV = 100, 0.5 CV = 50, >1.0 CV = 20
    const calculatedScore = Math.max(20, Math.min(100, Math.round(100 - cv * 100)));
    historicalIncomeStability = {
      calculatedScore,
      monthCount: incomeMonths.length,
      monthlyAverage: avg,
      coefficientOfVariation: cv,
      status: 'CALCULATED',
    };
  }

  return {
    userId,
    userProfile,
    salary,
    monthlyIncome,
    monthlyExpenses,
    monthlyBills,
    monthlyInstallments,
    monthlySavings,
    availableBalance,
    walletBalances,
    categorySpending,
    activeGoals,
    activeInstallments,
    activeInstallmentsList,
    wallets,
    totalWalletBalance,
    recentTransactions,
    currentBudget,
    goals,
    bills,
    unpaidBills,
    unpaidBillsTotal,
    installments,
    installmentDebtTotal,
    monthlyInstallmentObligation,
    debtsTotal,
    monthlySurplus,
    historicalIncomeStability,
    aiMemories,
    dataStatus,
    debts,
  };
}

