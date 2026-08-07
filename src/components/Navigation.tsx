import React from 'react';
import { AI_CONFIG } from '../ai/aiConfig';
import {
  LayoutDashboard,
  Receipt,
  Bot,
  PieChart,
  CalendarCheck,
  Target,
  HeartPulse,
  Users,
  BarChart3,
  AppWindow,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'transactions'
  | 'aicoach'
  | 'budgets'
  | 'bills'
  | 'goals'
  | 'health'
  | 'family'
  | 'reports'
  | 'widgets';

interface NavigationProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  lang: 'ar' | 'en';
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  setActiveTab,
  lang,
}) => {
  const isAr = lang === 'ar';

  const navItems = [
    {
      id: 'dashboard' as NavTab,
      labelAr: 'الرئيسية',
      labelEn: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'transactions' as NavTab,
      labelAr: 'المعاملات',
      labelEn: 'Transactions',
      icon: Receipt,
    },
    {
      id: 'aicoach' as NavTab,
      labelAr: 'المستشار AI',
      labelEn: 'AI Coach',
      icon: Bot,
      highlight: true,
    },
    {
      id: 'budgets' as NavTab,
      labelAr: 'الميزانية',
      labelEn: 'Budgets',
      icon: PieChart,
    },
    {
      id: 'bills' as NavTab,
      labelAr: 'الفواتير والاشتراكات',
      labelEn: 'Bills & Subs',
      icon: CalendarCheck,
    },
    {
      id: 'goals' as NavTab,
      labelAr: 'الأهداف والمحاكي',
      labelEn: 'Goals & Simulator',
      icon: Target,
    },
    {
      id: 'health' as NavTab,
      labelAr: 'الصحة المالية',
      labelEn: 'Health Score',
      icon: HeartPulse,
    },
    {
      id: 'family' as NavTab,
      labelAr: 'حساب العائلة',
      labelEn: 'Family Wallet',
      icon: Users,
    },
    {
      id: 'reports' as NavTab,
      labelAr: 'التقارير والتصدير',
      labelEn: 'Reports',
      icon: BarChart3,
    },
    {
      id: 'widgets' as NavTab,
      labelAr: 'الويدجت',
      labelEn: 'Widgets',
      icon: AppWindow,
    },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 min-h-[calc(100vh-4rem)] p-4 space-y-1.5 shrink-0">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          {isAr ? 'القائمة الرئيسية' : 'Main Menu'}
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20 font-bold'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  isActive
                    ? 'text-white'
                    : item.highlight
                    ? 'text-emerald-500'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              />
              <span>{isAr ? item.labelAr : item.labelEn}</span>
              {item.highlight && !isActive && (
                <span className="mr-auto ml-0 text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded-full">
                  AI
                </span>
              )}
            </button>
          );
        })}

        {/* Quick System Badge */}
        <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-200">
              <span>{isAr ? 'حالة السيرفر' : 'Server Status'}</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <p className="text-[11px]">
              {isAr ? AI_CONFIG.MODEL_DISPLAY_NAME_AR : `Connected to ${AI_CONFIG.MODEL_DISPLAY_NAME}`}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 shadow-lg">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg ${
                    isActive
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                      : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] leading-tight">
                  {isAr ? item.labelAr : item.labelEn}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
