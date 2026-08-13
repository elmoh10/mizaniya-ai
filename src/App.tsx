import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Navigation, NavTab } from './components/Navigation';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { AICoachView } from './components/AICoachView';
import { BudgetsView } from './components/BudgetsView';
import { BillsView } from './components/BillsView';
import { GoalsView } from './components/GoalsView';
import { HealthScoreView } from './components/HealthScoreView';
import { DebtsView } from './components/DebtsView';
import { FamilyView } from './components/FamilyView';
import { ReportsView } from './components/ReportsView';
import { AdminView } from './components/AdminView';
import { WidgetsView } from './components/WidgetsView';
import { WalletsView } from './components/WalletsView';
import { ProfileView } from './components/ProfileView';
import { AuthView } from './components/AuthView';

import { auth, onAuthStateChanged, firebaseSignOut, User } from './config/firebaseClient';
import { apiClient } from './services/apiClient';
import { Wallet, Transaction, Budget, Goal, Bill, Subscription, HealthScoreBreakdown, InsightTimelineItem } from './types';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function App() {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [darkMode, setDarkMode] = useState<boolean>(true);
  const [emergencyMode, setEmergencyMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string>('user');
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true);

  // App Data State
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budget, setBudget] = useState<Budget>({
    id: new Date().toISOString().slice(0, 7),
    monthKey: new Date().toISOString().slice(0, 7),
    month: new Date().toLocaleString('ar-EG', { month: 'long' }),
    year: new Date().getFullYear(),
    totalIncome: 0,
    totalSalary: 0,
    targetSavingsPercent: 20,
    savingsTargetPercent: 20,
    allocatedSavings: 0,
    categories: [],
  });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [subscriptions] = useState<Subscription[]>([]);
  const [healthScore, setHealthScore] = useState<HealthScoreBreakdown | null>(null);
  const [timeline, setTimeline] = useState<InsightTimelineItem[]>([]);

  // Data Loading States
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Modals
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Handle HTML document direction and Dark Mode class
  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        currentUser.getIdTokenResult().then((tokenResult) => {
          if (tokenResult.claims.admin === true || tokenResult.claims.role === 'admin') {
            setUserRole('admin');
          } else {
            setUserRole('user');
          }
        }).catch(() => setUserRole('user'));
      } else {
        setUserRole('user');
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch Live Data
  const loadAppData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    setDataError(null);

    try {
      const [walletsRes, txsRes, budgetRes, goalsRes, billsRes, healthRes, insightsRes] = await Promise.all([
        apiClient.get('/wallets'),
        apiClient.get('/transactions'),
        apiClient.get('/budgets/current'),
        apiClient.get('/goals'),
        apiClient.get('/bills'),
        apiClient.get('/financial-health'),
        apiClient.get('/smart-insights'),
      ]);

      if (walletsRes.success) setWallets(walletsRes.wallets || []);
      if (txsRes.success) setTransactions(txsRes.transactions || []);
      if (budgetRes.success && budgetRes.budget) setBudget(budgetRes.budget);
      if (goalsRes.success) setGoals(goalsRes.goals || []);
      if (billsRes.success) setBills(billsRes.bills || []);
      if (insightsRes?.success && insightsRes.data?.timeline) setTimeline(insightsRes.data.timeline);
      if (healthRes.success && healthRes.status === 'CALCULATED' && healthRes.score) {
        setHealthScore(healthRes.score);
      } else {
        setHealthScore(null);
      }
    } catch (err: any) {
      console.error('Failed to load application data:', err);
      setDataError(err.message || 'فشل تحميل البيانات الحقيقية من الخادم');
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadAppData();
    }
  }, [user, loadAppData]);

  // Real Add Transaction
  const handleAddTransaction = async (newTxData: Omit<Transaction, 'id'>) => {
    try {
      const res = await apiClient.post('/transactions', newTxData);
      if (res.success) {
        await loadAppData();
      } else {
        alert(res.error || 'فشلت عملية حفظ المعاملة.');
      }
    } catch (err: any) {
      console.error('Error creating transaction:', err);
      alert('تعذر حفظ المعاملة في الخادم.');
    }
  };

  // Real Persisted Pay Bill
  const handlePayBill = async (billId: string) => {
    try {
      const res = await apiClient.post(`/bills/${billId}/pay`);
      if (res.success) {
        await loadAppData();
      } else {
        alert(res.error || 'فشلت عملية سداد الفاتورة.');
      }
    } catch (err: any) {
      console.error('Error paying bill:', err);
      alert('تعذر تسجيل سداد الفاتورة في الخادم.');
    }
  };

  // Real Persisted Update Budget
  const handleUpdateBudget = async (newBudget: Budget) => {
    try {
      const res = await apiClient.post('/budgets', newBudget);
      if (res.success && res.budget) {
        setBudget(res.budget);
        await loadAppData();
      } else {
        setBudget(newBudget);
      }
    } catch (err: any) {
      console.error('Error updating budget:', err);
      alert('تعذر حفظ التغييرات في الميزانية على الخادم.');
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      setUser(null);
      setUserRole('user');
      setWallets([]);
      setTransactions([]);
      setBudget({
        id: new Date().toISOString().slice(0, 7),
        monthKey: new Date().toISOString().slice(0, 7),
        month: new Date().toLocaleString('ar-EG', { month: 'long' }),
        year: new Date().getFullYear(),
        totalIncome: 0,
        totalSalary: 0,
        targetSavingsPercent: 20,
        savingsTargetPercent: 20,
        allocatedSavings: 0,
        categories: [],
      });
      setGoals([]);
      setBills([]);
      setHealthScore(null);
      setDataError(null);
      setActiveTab('dashboard');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-500 border-t-transparent mb-4" />
        <p className="text-sm text-slate-400 font-medium">جاري التحقق من هوية المستخدم والمصادقة...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthView onAuthenticated={() => loadAppData()} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      {/* Top Header */}
      <Header
        lang={lang}
        setLang={setLang}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        emergencyMode={emergencyMode}
        setEmergencyMode={setEmergencyMode}
        onOpenAdmin={() => setShowAdminModal(true)}
        onOpenVoice={() => setActiveTab('transactions')}
        unreadAlertsCount={0}
        isAdmin={userRole === 'admin'}
        userEmail={user.email || undefined}
        userName={user.displayName || undefined}
        onOpenProfile={() => setActiveTab('profile')}
        onLogout={handleLogout}
      />

      {/* Main Container Layout */}
      <div className="max-w-7xl mx-auto flex">
        {/* Navigation Sidebar / Mobile Bar */}
        <Navigation activeTab={activeTab} setActiveTab={setActiveTab} lang={lang} />

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {dataError && (
            <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{dataError}</span>
              </div>
              <button
                onClick={loadAppData}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة</span>
              </button>
            </div>
          )}

          {dataLoading ? (
            <div className="p-12 text-center text-slate-500 text-xs animate-pulse space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
              <p>جاري جلب بياناتك المالية الحقيقية من الخادم...</p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  wallets={wallets}
                  transactions={transactions}
                  budget={budget}
                  goals={goals}
                  bills={bills}
                  healthScore={healthScore}
                  timeline={timeline}
                  lang={lang}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onOpenVoice={() => setActiveTab('transactions')}
                  onOpenScan={() => setActiveTab('transactions')}
                />
              )}

              {activeTab === 'transactions' && (
                <TransactionsView
                  transactions={transactions}
                  wallets={wallets}
                  onAddTransaction={handleAddTransaction}
                  lang={lang}
                />
              )}

              {activeTab === 'wallets' && (
                <WalletsView
                  wallets={wallets}
                  onRefreshWallets={loadAppData}
                  lang={lang}
                />
              )}

              {activeTab === 'profile' && (
                <ProfileView
                  userEmail={user.email || ''}
                  lang={lang}
                  onProfileUpdated={loadAppData}
                />
              )}

              {activeTab === 'aicoach' && <AICoachView lang={lang} user={user} />}

              {activeTab === 'budgets' && (
                <BudgetsView
                  budget={budget}
                  onUpdateBudget={handleUpdateBudget}
                  lang={lang}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                />
              )}

              {activeTab === 'bills' && (
                <BillsView
                  bills={bills}
                  subscriptions={subscriptions}
                  onPayBill={handlePayBill}
                  lang={lang}
                />
              )}

              {activeTab === 'debts' && (
                <DebtsView
                  lang={lang}
                  onRefreshData={loadAppData}
                />
              )}

              {activeTab === 'goals' && <GoalsView goals={goals} lang={lang} />}

              {activeTab === 'health' && (
                <HealthScoreView healthScore={healthScore} lang={lang} />
              )}

              {activeTab === 'family' && <FamilyView lang={lang} enabled={false} />}

              {activeTab === 'reports' && (
                <ReportsView transactions={transactions} budget={budget} lang={lang} />
              )}

              {activeTab === 'widgets' && (
                <WidgetsView
                  wallets={wallets}
                  bills={bills}
                  healthScore={healthScore}
                  lang={lang}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Admin Dashboard Modal */}
      {showAdminModal && (
        <AdminView onClose={() => setShowAdminModal(false)} lang={lang} />
      )}
    </div>
  );
}

export default App;
