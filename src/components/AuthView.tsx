import React, { useState } from 'react';
import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from '../config/firebaseClient';
import { apiClient } from '../services/apiClient';
import { Lock, Mail, ShieldCheck, ArrowRight, User as UserIcon, Wallet } from 'lucide-react';

interface AuthViewProps {
  onAuthenticated: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onAuthenticated }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [salary, setSalary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
        await apiClient.post('/profile/onboarding', {
          displayName: displayName || email.split('@')[0],
          salary: Number(salary) || 0,
          currency: 'EGP',
          country: 'EG',
          language: 'ar',
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onAuthenticated();
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'فشلت عملية تسجيل الدخول. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4" dir="rtl">
      <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl p-8 max-w-md w-full shadow-2xl backdrop-blur-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-400 border border-blue-500/30">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
            ميزانية AI
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {isRegister ? 'إنشاء حساب جديد مشفر في مصر' : 'تسجيل الدخول لإدارة أموالك بذكاء الاصطناعي'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">الاسم الكامل</label>
                <div className="relative">
                  <UserIcon className="absolute right-3 top-3 w-5 h-5 text-slate-500" />
                  <input
                    type="text"
                    required={isRegister}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="أحمد محمد"
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">الراتب / الدخل الشهري المعتاد (ج.م)</label>
                <div className="relative">
                  <Wallet className="absolute right-3 top-3 w-5 h-5 text-slate-500" />
                  <input
                    type="number"
                    min="0"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="مثال: 15000"
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:border-blue-500 text-white"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">البريد الإلكتروني</label>
            <div className="relative">
              <Mail className="absolute right-3 top-3 w-5 h-5 text-slate-500" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-slate-900/80 border border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">كلمة السر</label>
            <div className="relative">
              <Lock className="absolute right-3 top-3 w-5 h-5 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-900/80 border border-slate-700 rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:border-blue-500 text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
          >
            {loading ? (
              <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            ) : (
              <>
                <span>{isRegister ? 'إنشاء حساب' : 'تسجيل الدخول'}</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-700/60 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-slate-400 hover:text-slate-200 text-center transition"
          >
            {isRegister ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'ليس لديك حساب؟ إنشاء حساب جديد'}
          </button>
        </div>
      </div>
    </div>
  );
};
