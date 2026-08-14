import React, { useState } from 'react';
import {
  Bot,
  AlertOctagon,
  Moon,
  Sun,
  Globe,
  Sliders,
  Volume2,
  Bell,
  User as UserIcon,
  LogOut,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  lang: 'ar' | 'en';
  setLang: (l: 'ar' | 'en') => void;
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  emergencyMode: boolean;
  setEmergencyMode: (e: boolean) => void;
  onOpenAdmin: () => void;
  onOpenVoice: () => void;
  voiceEnabled?: boolean;
  emergencyEnabled?: boolean;
  unreadAlertsCount: number;
  onOpenNotifications?: () => void;
  isAdmin?: boolean;
  userEmail?: string;
  userName?: string;
  onOpenProfile?: () => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  lang,
  setLang,
  darkMode,
  setDarkMode,
  emergencyMode,
  setEmergencyMode,
  onOpenAdmin,
  onOpenVoice,
  voiceEnabled = true,
  emergencyEnabled = true,
  unreadAlertsCount,
  onOpenNotifications,
  isAdmin = false,
  userEmail,
  userName,
  onOpenProfile,
  onLogout,
}) => {
  const isAr = lang === 'ar';
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      {/* Top Notice Bar if Emergency Mode is Active */}
      {emergencyMode && (
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 text-white px-4 py-1.5 text-xs font-medium flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-2 mx-auto">
            <AlertOctagon className="w-4 h-4 animate-pulse" />
            <span>
              {isAr
                ? '⚠️ تم تفعيل "وضع الطوارئ المالي": تم تجميد ميزانية الترفيه وتخصيص الفائض للالتزامات الضرورية فقط'
                : '⚠️ "Emergency Mode" Activated: Non-essential budgets frozen, surplus directed to vital bills.'}
            </span>
          </div>
          <button
            onClick={() => setEmergencyMode(false)}
            className="text-white/80 hover:text-white underline text-xs font-semibold px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition"
          >
            {isAr ? 'إلغاء' : 'Dismiss'}
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 text-white shadow-md shadow-emerald-500/20">
            <Bot className="w-6 h-6" />
            <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white border-2 border-white dark:border-slate-900">
              🇪🇬
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent">
                {isAr ? 'ميزانية AI' : 'Mizaniya AI'}
              </h1>
              <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                مصر v5.9
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
              {isAr
                ? 'منصة الذكاء الاصطناعي لإدارة المالية الشخصية'
                : 'Arabic AI Personal Finance Engine'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Voice Logging Button */}
          {voiceEnabled && <button
            onClick={onOpenVoice}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900 transition shadow-sm"
            title={isAr ? 'تسجيل صوتی بالعامية المصرية' : 'Voice Assistant'}
          >
            <Volume2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-pulse" />
            <span className="hidden md:inline">
              {isAr ? 'تسجيل صوتي' : 'Voice Expense'}
            </span>
          </button>}

          {/* Emergency Mode Toggle */}
          {emergencyEnabled && <button
            onClick={() => setEmergencyMode(!emergencyMode)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              emergencyMode
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
            title={isAr ? 'تفعيل/إلغاء وضع الطوارئ المالي' : 'Emergency Mode Toggle'}
          >
            <span className="hidden lg:inline">
              {emergencyMode
                ? isAr
                  ? 'وضع الطوارئ نشط'
                  : 'Emergency Active'
                : isAr
                ? 'وضع الطوارئ'
                : 'Emergency Mode'}
            </span>
          </button>}

          {/* Admin Dashboard (Visible only for admins) */}
          {isAdmin && (
            <button
              onClick={onOpenAdmin}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title={isAr ? 'لوحة تحكم المسؤول والنظام' : 'Admin & Feature Flags'}
            >
              <Sliders className="w-4 h-4" />
            </button>
          )}

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={onOpenNotifications}
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              title={isAr ? 'التنبيهات والإشعارات' : 'Notifications'}
            >
              <Bell className="w-4 h-4" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-bounce">
                  {unreadAlertsCount}
                </span>
              )}
            </button>
          </div>

          {/* Language Switcher */}
          <button
            onClick={() => setLang(isAr ? 'en' : 'ar')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-600" />
            <span>{isAr ? 'EN' : 'عربي'}</span>
          </button>

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title={darkMode ? 'وضع الإضاءة' : 'الوضع الليلي'}
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/80 text-xs font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition"
            >
              <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-black text-[11px]">
                {userName ? userName.charAt(0).toUpperCase() : userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
              </div>
              <span className="hidden sm:inline max-w-[100px] truncate">{userName || userEmail || (isAr ? 'حسابي' : 'Account')}</span>
              <ChevronDown className="w-3.5 h-3.5 text-emerald-600" />
            </button>

            {showUserMenu && (
              <div className="absolute left-0 sm:right-0 sm:left-auto mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 text-xs space-y-1">
                {userEmail && (
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] text-slate-400 font-medium">{isAr ? 'مسجل كـ' : 'Signed in as'}</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{userEmail}</p>
                  </div>
                )}

                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    if (onOpenProfile) onOpenProfile();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition"
                >
                  <UserIcon className="w-4 h-4 text-emerald-600" />
                  <span>{isAr ? 'الملف الشخصي' : 'Profile'}</span>
                </button>

                {onLogout && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold transition"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{isAr ? 'تسجيل الخروج' : 'Logout'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
