export type AIAgentType = 'coach' | 'budget' | 'savings' | 'debt' | 'fraud';

export interface AgentConfigItem {
  id: AIAgentType;
  name: string;
  nameAr: string;
  role: string;
  roleAr: string;
  welcomeMessage: string;
  welcomeMessageAr: string;
  color: string;
  iconName: 'Bot' | 'PieChart' | 'PiggyBank' | 'ShieldAlert' | 'Lock';
}

export const AGENT_CONFIG: Record<AIAgentType, AgentConfigItem> = {
  coach: {
    id: 'coach',
    name: 'Financial Coach',
    nameAr: 'كوتش ميزانية AI',
    role: 'Financial Coach',
    roleAr: 'المستشار المالي الشامل',
    welcomeMessage: 'Welcome! I am your Mizaniya AI Financial Coach. How can I assist you with your finances today?',
    welcomeMessageAr: 'أهلاً بيك! أنا كوتش ميزانية AI، مستشارك المالي الشخصي. اسألني عن مصاريفك، قراراتك المالية أو خطتك للشهر.',
    color: 'from-blue-600 to-indigo-600',
    iconName: 'Bot',
  },
  budget: {
    id: 'budget',
    name: 'Budget Master',
    nameAr: 'خبير التقسيم المالي',
    role: 'Budget Master',
    roleAr: 'مخطط الميزانية والتضخم',
    welcomeMessage: 'Welcome! I am your Budget Master. I can help you split your salary and create a suitable budget for your commitments and goals.',
    welcomeMessageAr: 'أهلاً بيك! أنا خبير التقسيم المالي. أقدر أساعدك تقسّم مرتبك وتعمل ميزانية مناسبة لالتزاماتك وأهدافك.',
    color: 'from-emerald-600 to-teal-600',
    iconName: 'PieChart',
  },
  savings: {
    id: 'savings',
    name: 'Savings Specialist',
    nameAr: 'خبير التوفير',
    role: 'Savings Specialist',
    roleAr: 'مكتشف الفرص والتوفير',
    welcomeMessage: 'Welcome! I am your Savings Specialist. Tell me how much you want to save and in what period, and I will help you make a realistic plan.',
    welcomeMessageAr: 'أهلاً بيك! أنا خبير التوفير. قولي عاوز توفر كام وفي مدة قد إيه وأنا أساعدك نعمل خطة واقعية.',
    color: 'from-amber-500 to-yellow-600',
    iconName: 'PiggyBank',
  },
  debt: {
    id: 'debt',
    name: 'Debt Snowball',
    nameAr: 'مستشار الديون',
    role: 'Debt Snowball',
    roleAr: 'مفكك الأقساط والديون',
    welcomeMessage: 'Welcome! I am your Debt Advisor. I can review your installments and debts and help you choose the fastest and best repayment plan.',
    welcomeMessageAr: 'أهلاً بيك! أنا مستشار الديون. أقدر أراجع أقساطك وديونك وأساعدك تختار أسرع وأفضل خطة للسداد.',
    color: 'from-rose-600 to-red-600',
    iconName: 'ShieldAlert',
  },
  fraud: {
    id: 'fraud',
    name: 'Fraud & Duplicate Detector',
    nameAr: 'مكتشف الشبهات',
    role: 'Fraud & Duplicate Detector',
    roleAr: 'حارس المعاملات المكررة',
    welcomeMessage: 'Welcome! I am your Fraud Detector. I can review your transactions and help you discover any abnormal or duplicate operations.',
    welcomeMessageAr: 'أهلاً بيك! أنا مكتشف الشبهات. أقدر أراجع معاملاتك وأساعدك تكتشف أي عملية غير طبيعية أو مكررة.',
    color: 'from-purple-600 to-indigo-700',
    iconName: 'Lock',
  },
};
