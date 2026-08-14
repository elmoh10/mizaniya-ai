import React, { useState } from 'react';
import { Transaction, Wallet, CategoryType, PaymentMethod } from '../types';
import { formatCurrency, formatDate, getCategoryColor } from '../utils/formatters';
import { apiClient } from '../services/apiClient';
import {
  Plus,
  Scan,
  Volume2,
  Receipt,
  Search,
  Filter,
  Sparkles,
  X,
  Upload,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

interface TransactionsViewProps {
  transactions: Transaction[];
  wallets: Wallet[];
  onAddTransaction: (t: Omit<Transaction, 'id'>) => Promise<void> | void;
  lang: 'ar' | 'en';
  voiceEnabled?: boolean;
  ocrEnabled?: boolean;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  wallets,
  onAddTransaction,
  lang,
  voiceEnabled = true,
  ocrEnabled = true,
}) => {
  const isAr = lang === 'ar';

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState<CategoryType>('Food & Groceries');
  const [walletId, setWalletId] = useState(wallets[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('InstaPay');
  const [merchant, setMerchant] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Voice State
  const [voiceText, setVoiceText] = useState('');
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [voiceParsedResult, setVoiceParsedResult] = useState<any>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // OCR Extraction State
  const [isOCRProcessing, setIsOCRProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Filter Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  React.useEffect(() => {
    if (wallets && wallets.length > 0) {
      if (!walletId || wallets.length === 1 || !wallets.some((w) => w.id === walletId)) {
        setWalletId(wallets[0].id);
      }
    }
  }, [wallets, walletId]);

  // Handle Manual Submission
  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!amount || parseFloat(amount) <= 0) return;

    const targetWalletId = walletId || wallets[0]?.id;
    if (!targetWalletId) {
      setSubmitError(isAr ? 'يرجى إنشاء محفظة مالية أولاً من قسم المحافظ قبل تسجيل المعاملة.' : 'Please create a wallet first.');
      return;
    }

    try {
      await onAddTransaction({
        title: title || (isAr ? 'معاملة مالية جديدة' : 'New Transaction'),
        amount: parseFloat(amount),
        currency: 'EGP',
        type,
        category,
        walletId: targetWalletId,
        paymentMethod,
        date: new Date().toISOString().split('T')[0],
        merchant: merchant || undefined,
        notes: notes || undefined,
        aiTag: isAr ? 'معاملة يدوية' : 'Manual Entry',
      });

      // Reset
      setTitle('');
      setAmount('');
      setMerchant('');
      setNotes('');
      setShowAddModal(false);
    } catch (err: any) {
      setSubmitError(err.message || (isAr ? 'فشلت عملية إضافة المعاملة' : 'Failed to add transaction'));
    }
  };

  // OCR Upload file and send to backend
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOCRProcessing(true);
    setOcrError(null);
    setOcrResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64String = event.target?.result as string;
        if (!base64String) {
          setOcrError('Failed to read image file');
          setIsOCRProcessing(false);
          return;
        }

        const base64Data = base64String.split(',')[1];
        const res = await apiClient.post('/ai/analyze-receipt', {
          base64Image: base64Data,
          mimeType: file.type || 'image/jpeg',
        });

        if (res.success && res.data) {
          setOcrResult(res.data);
        } else {
          setOcrError(res.error || (isAr ? 'لم نتمكن من قراءة الفاتورة.' : 'Failed to analyze receipt.'));
        }
        setIsOCRProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setOcrError(err.message || 'Error uploading receipt');
      setIsOCRProcessing(false);
    }
  };

  // Confirm OCR and create transaction
  const handleConfirmOCR = async () => {
    if (!ocrResult) return;
    await onAddTransaction({
      title: `${ocrResult.merchant || 'فاتورة ممسوحة'} - ${ocrResult.items?.[0]?.name || ''}`.trim(),
      amount: Number(ocrResult.totalAmount || ocrResult.amount || 0),
      currency: 'EGP',
      type: 'expense',
      category: ocrResult.category || 'Food & Groceries',
      walletId: wallets[0]?.id || '',
      paymentMethod: ocrResult.paymentMethod || 'InstaPay',
      date: ocrResult.date || new Date().toISOString().split('T')[0],
      merchant: ocrResult.merchant || '',
      notes: `تم الاستخراج ذكياً من الفاتورة`,
      aiTag: 'مسح ضوئي ذكي OCR',
    });
    setOcrResult(null);
    setShowOCRModal(false);
  };

  // Process Voice Logging Text via Real Backend API
  const handleProcessVoiceText = async () => {
    if (!voiceText.trim()) return;

    setIsVoiceLoading(true);
    setVoiceError(null);
    setVoiceParsedResult(null);

    try {
      const response = await apiClient.post('/ai/parse-voice', {
        spokenText: voiceText,
      });

      if (response.success && response.data) {
        setVoiceParsedResult(response.data);
      } else {
        setVoiceError(response.error || (isAr ? 'فشل تحليل الصوت' : 'Failed to parse voice command'));
      }
    } catch (err: any) {
      setVoiceError(err.message || 'Voice parsing failed');
    } finally {
      setIsVoiceLoading(false);
    }
  };

  const handleConfirmVoiceParsed = async () => {
    if (!voiceParsedResult) return;
    await onAddTransaction({
      title: voiceParsedResult.title || voiceText,
      amount: Number(voiceParsedResult.amount || 0),
      currency: 'EGP',
      type: voiceParsedResult.type || 'expense',
      category: voiceParsedResult.category || 'Food & Groceries',
      walletId: wallets[0]?.id || '',
      paymentMethod: voiceParsedResult.paymentMethod || 'InstaPay',
      date: new Date().toISOString().split('T')[0],
      merchant: voiceParsedResult.merchant || undefined,
      aiTag: 'تسجيل صوتی بالعامية',
    });

    setVoiceText('');
    setVoiceParsedResult(null);
    setShowVoiceModal(false);
  };

  // Filtered List
  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.merchant && t.merchant.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn" dir="rtl">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-7 h-7 text-emerald-600" />
            <span>{isAr ? 'سجل المعاملات والمسح الضوئي' : 'Transactions & OCR Intelligence'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'تسجيل المعاملات اليومية، مسح الفواتير بالفون، والتعرف الذكي على المحلات المصرية'
              : 'Log daily expenses, scan Egyptian receipts, auto-categorize'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => ocrEnabled && setShowOCRModal(true)}
            disabled={!ocrEnabled}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-md transition"
          >
            <Scan className="w-4 h-4" />
            <span>{isAr ? 'مسح فاتورة OCR' : 'Scan Receipt'}</span>
          </button>

          <button
            onClick={() => voiceEnabled && setShowVoiceModal(true)}
            disabled={!voiceEnabled}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition"
          >
            <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>{isAr ? 'تسجيل صوتی' : 'Voice Expense'}</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة معاملة' : 'Add Manual'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'ابحث في المعاملات أو أسماء المحلات (كارفور، كازيون، طلبات...)' : 'Search transactions...'}
            className="w-full pr-10 pl-4 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
          >
            <option value="all">{isAr ? 'جميع الفئات' : 'All Categories'}</option>
            <option value="Food & Groceries">{isAr ? 'الأكل والسوبرماركت' : 'Food & Groceries'}</option>
            <option value="Housing & Utilities">{isAr ? 'السكن والفواتير' : 'Housing & Utilities'}</option>
            <option value="Bills & Subscriptions">{isAr ? 'الفواتير والاشتراكات' : 'Bills & Subscriptions'}</option>
            <option value="Transport & Ride Apps">{isAr ? 'المواصلات وأوبر' : 'Transport & Ride Apps'}</option>
            <option value="Installments & Debt">{isAr ? 'الأقساط والالتزامات' : 'Installments'}</option>
            <option value="Shopping & Entertainment">{isAr ? 'الترفيه والدليفري' : 'Shopping'}</option>
          </select>
        </div>
      </div>

      {/* Transactions List */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        {filteredTransactions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <Receipt className="w-10 h-10 mx-auto opacity-40" />
            <p className="text-sm">{isAr ? 'لا توجد معاملات مسجلة حتى الآن' : 'No transactions found'}</p>
          </div>
        ) : (
          filteredTransactions.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-emerald-500/50 transition"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2.5 rounded-xl text-white font-bold shrink-0 ${
                    t.type === 'income' ? 'bg-emerald-600' : 'bg-slate-700'
                  }`}
                >
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {t.title}
                    </h4>
                    {t.aiTag && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                        {t.aiTag}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
                    <span>{t.merchant || 'معاملة'}</span>
                    <span>•</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {t.paymentMethod}
                    </span>
                    <span>•</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getCategoryColor(t.category)}`}>
                      {t.category}
                    </span>
                  </div>

                  {t.notes && (
                    <p className="text-[11px] text-slate-400 mt-1 italic">{t.notes}</p>
                  )}
                </div>
              </div>

              <div className="text-right sm:text-left shrink-0">
                <span
                  className={`text-base font-black ${
                    t.type === 'income' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {t.type === 'income' ? '+' : '-'}
                  {formatCurrency(t.amount, 'EGP', lang)}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {formatDate(t.date, lang)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* --- MODAL 1: ADD MANUAL TRANSACTION --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative space-y-4">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 left-4 p-1 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              <span>{isAr ? 'إضافة معاملة جديدة' : 'Add New Transaction'}</span>
            </h3>

            <form onSubmit={handleSubmitManual} className="space-y-3 text-xs">
              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Wallet Selector */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {isAr ? 'المحفظة المستخدمة' : 'Wallet'}
                </label>
                {wallets.length === 0 ? (
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
                    ⚠️ {isAr ? 'لا توجد أي محفظة مسجلة. يرجى إنشاء محفظة أولاً من قسم المحافظ.' : 'No wallet found. Please create one in Wallets tab.'}
                  </div>
                ) : (
                  <select
                    value={walletId}
                    onChange={(e) => setWalletId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.type}) - {formatCurrency(w.balance, w.currency || 'EGP', lang)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {isAr ? 'نوع المعاملة' : 'Type'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('expense')}
                    className={`py-2 rounded-xl font-bold transition ${
                      type === 'expense'
                        ? 'bg-rose-600 text-white shadow'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {isAr ? 'مصروف (-)' : 'Expense (-)'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('income')}
                    className={`py-2 rounded-xl font-bold transition ${
                      type === 'income'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {isAr ? 'دخل (+)' : 'Income (+)'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {isAr ? 'المبلغ بالجنيه المصري (EGP)' : 'Amount (EGP)'}
                </label>
                <input
                  type="number"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {isAr ? 'عنوان المعاملة' : 'Title'}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={isAr ? 'مثال: مشتريات كازيون، بنزين السيارة...' : 'Title'}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    {isAr ? 'الفئة' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CategoryType)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="Food & Groceries">{isAr ? 'الأكل والسوبرماركت' : 'Food & Groceries'}</option>
                    <option value="Housing & Utilities">{isAr ? 'السكن والفواتير' : 'Housing & Utilities'}</option>
                    <option value="Bills & Subscriptions">{isAr ? 'الفواتير والاشتراكات' : 'Bills & Subs'}</option>
                    <option value="Transport & Ride Apps">{isAr ? 'المواصلات وأوبر' : 'Transport'}</option>
                    <option value="Installments & Debt">{isAr ? 'الأقساط والالتزامات' : 'Installments'}</option>
                    <option value="Shopping & Entertainment">{isAr ? 'الترفيه والدليفري' : 'Shopping'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    {isAr ? 'وسيلة الدفع' : 'Payment Method'}
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  >
                    <option value="InstaPay">إنستا باي (InstaPay)</option>
                    <option value="Vodafone Cash">فودافون كاش</option>
                    <option value="CIB Bank">بنك CIB</option>
                    <option value="Fawry">فوري (Fawry)</option>
                    <option value="Cash">كاش</option>
                    <option value="Valu">فاليو (Valu)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {isAr ? 'اسم التاجر / المحل (اختياري)' : 'Merchant'}
                </label>
                <input
                  type="text"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Carrefour, Kazyon, Talabat..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg transition"
              >
                {isAr ? 'حفظ المعاملة الآن' : 'Save Transaction'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: REAL OCR RECEIPT SCANNER --- */}
      {ocrEnabled && showOCRModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative space-y-4">
            <button
              onClick={() => {
                setShowOCRModal(false);
                setOcrResult(null);
                setOcrError(null);
              }}
              className="absolute top-4 left-4 p-1 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Scan className="w-5 h-5 text-teal-600" />
              <span>{isAr ? 'الماسح الضوئي الذكي للفواتير (Gemini Vision OCR)' : 'OCR Receipt Intelligence'}</span>
            </h3>

            {ocrError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{ocrError}</span>
              </div>
            )}

            {!ocrResult ? (
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-400">
                  {isAr
                    ? 'قم برفع صورة الفاتورة للتعرف الذكي على الأصناف والقيمة الكلية باستعمال Gemini Vision:'
                    : 'Upload a receipt image for Gemini Vision extraction:'}
                </p>

                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-6 text-center hover:border-teal-500 transition relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={isOCRProcessing}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Upload className="w-8 h-8 text-teal-500 mx-auto mb-2" />
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {isAr ? 'انقر هنا لرفع صورة الفاتورة' : 'Click or drop receipt image'}
                  </p>
                  <p className="text-slate-400 text-[10px] mt-1">PNG, JPG, WEBP</p>
                </div>

                {isOCRProcessing && (
                  <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-center space-y-2">
                    <Sparkles className="w-6 h-6 text-teal-600 animate-spin mx-auto" />
                    <p className="font-bold text-teal-800 dark:text-teal-200">
                      جاري تحليل صورة الفاتورة بأمان عبر Gemini...
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-emerald-900 dark:text-emerald-100">
                      {ocrResult.merchant || 'فاتورة غير معروفة'}
                    </span>
                    <span className="font-black text-sm text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(Number(ocrResult.totalAmount || ocrResult.amount || 0), 'EGP', lang)}
                    </span>
                  </div>

                  <p className="text-slate-600 dark:text-slate-300">
                    {isAr ? 'الفئة:' : 'Category:'}{' '}
                    <span className="font-bold">{ocrResult.category || 'Food & Groceries'}</span> |{' '}
                    {isAr ? 'طريقة الدفع:' : 'Payment:'}{' '}
                    <span className="font-bold">{ocrResult.paymentMethod || 'InstaPay'}</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleConfirmOCR}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? 'تأكيد وحفظ المعاملة' : 'Confirm & Save'}</span>
                  </button>
                  <button
                    onClick={() => setOcrResult(null)}
                    className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                  >
                    {isAr ? 'إلغاء' : 'Reset'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL 3: VOICE EXPENSE LOGGING --- */}
      {voiceEnabled && showVoiceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative space-y-4">
            <button
              onClick={() => {
                setShowVoiceModal(false);
                setVoiceParsedResult(null);
                setVoiceError(null);
              }}
              className="absolute top-4 left-4 p-1 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-emerald-600 animate-pulse" />
              <span>{isAr ? 'التسجيل الصوتي بالعامية المصرية' : 'Voice Expense Assistant'}</span>
            </h3>

            {voiceError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{voiceError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                {isAr
                  ? 'اكتب أو تحدث بالجملة وسيتم استخراج المبلغ والتاجر والفئة عبر الذكاء الاصطناعي:'
                  : 'Speak or type in Egyptian Arabic:'}
              </p>

              <textarea
                rows={3}
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                placeholder={isAr ? 'دفعت 1480 جنيه في سوبرماركت كازيون بإنستا باي...' : 'Type spoken text...'}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />

              {voiceParsedResult ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-2">
                  <p className="font-bold text-slate-900 dark:text-white text-sm">
                    {voiceParsedResult.title || voiceText}
                  </p>
                  <p className="text-emerald-600 font-bold text-base">
                    {formatCurrency(Number(voiceParsedResult.amount || 0), 'EGP', lang)}
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    {isAr ? 'الفئة:' : 'Category:'} {voiceParsedResult.category || 'Food & Groceries'} |{' '}
                    {isAr ? 'وسيلة الدفع:' : 'Payment:'} {voiceParsedResult.paymentMethod || 'InstaPay'}
                  </p>

                  <button
                    onClick={handleConfirmVoiceParsed}
                    className="w-full mt-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow transition flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isAr ? 'تأكيد إضافة المعاملة' : 'Confirm & Save'}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleProcessVoiceText}
                  disabled={!voiceText.trim() || isVoiceLoading}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold shadow-lg transition flex items-center justify-center gap-2"
                >
                  {isVoiceLoading ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{isAr ? 'تحليل الكلام بالذكاء الاصطناعي' : 'Analyze Voice'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
