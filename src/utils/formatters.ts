export function formatCurrency(
  amount: number,
  currency: string = 'EGP',
  lang: 'ar' | 'en' = 'ar'
): string {
  const formattedNumber = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-EG', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount);

  if (lang === 'ar') {
    return `${formattedNumber} ج.م`;
  }
  return `${formattedNumber} EGP`;
}

export function formatDate(dateStr: string, lang: 'ar' | 'en' = 'ar'): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
}

export function getCategoryColor(category: string): string {
  switch (category) {
    case 'Food & Groceries':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'Housing & Utilities':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    case 'Bills & Subscriptions':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';
    case 'Transport & Ride Apps':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'Installments & Debt':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
    case 'Health & Education':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
    case 'Shopping & Entertainment':
      return 'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300';
    case 'Emergency & Savings':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300';
    case 'Income & Salary':
      return 'bg-emerald-500 text-white';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}
