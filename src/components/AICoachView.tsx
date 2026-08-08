import React, { useState, useEffect } from 'react';
import { ChatMessage } from '../types';
import { apiClient } from '../services/apiClient';
import { User as FirebaseUser } from '../config/firebaseClient';
import { AGENT_CONFIG, AIAgentType } from '../config/agentConfig';
import { db } from '../config/firebaseClient';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  orderBy,
  getDoc,
} from 'firebase/firestore';
import {
  Bot,
  Send,
  PieChart,
  PiggyBank,
  ShieldAlert,
  Lock,
  Sparkles,
  User as LucideUser,
  Database,
} from 'lucide-react';

interface AICoachViewProps {
  lang: 'ar' | 'en';
  user: FirebaseUser | null;
}

export const AICoachView: React.FC<AICoachViewProps> = ({ lang, user }) => {
  const isAr = lang === 'ar';

  const [activeAgent, setActiveAgent] = useState<AIAgentType>('coach');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState<boolean>(true);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showMemoryModal, setShowMemoryModal] = useState(false);

  // Suggested Prompts
  const suggestedPrompts = [
    isAr ? 'هل أقدر أشتري لاب توب الشهر ده بقسط أو كاش؟' : 'Can I buy a laptop this month?',
    isAr ? 'ازاي أوفر 2,000 جنيه من مصاريف السوبرماركت؟' : 'How to save 2000 EGP on groceries?',
    isAr ? 'ايه أسرع طريقة للتخلص من الديون المتبقية؟' : 'Fastest way to clear remaining debt?',
    isAr ? 'سيموليشن: لو التضخم زاد 15% الميزانية تتأثر ازاي؟' : 'Simulation: What if inflation rises 15%?',
  ];

  const currentAgentObj = AGENT_CONFIG[activeAgent];

  // Load chat history from Firestore when activeAgent or user changes
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const loadConversation = async () => {
      setMessagesLoading(true);
      try {
        const uid = user.uid;
        const convRef = doc(db, 'users', uid, 'ai_conversations', activeAgent);
        const msgsRef = collection(db, 'users', uid, 'ai_conversations', activeAgent, 'messages');
        const q = query(msgsRef, orderBy('createdAt', 'asc'));
        const querySnap = await getDocs(q);

        const loadedMessages: ChatMessage[] = [];
        querySnap.forEach((docSnap) => {
          const data = docSnap.data();
          loadedMessages.push({
            id: docSnap.id,
            sender: data.sender,
            agent: activeAgent,
            text: data.text || '',
            timestamp: data.timestamp || new Date(data.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isSystemGreeting: data.isSystemGreeting || false,
          });
        });

        if (isMounted) {
          if (loadedMessages.length === 0) {
            // Setup welcome message
            const welcomeText = isAr
              ? AGENT_CONFIG[activeAgent].welcomeMessageAr
              : AGENT_CONFIG[activeAgent].welcomeMessage;

            const welcomeMsg: ChatMessage = {
              id: 'welcome_' + activeAgent + '_' + Date.now(),
              sender: 'ai',
              agent: activeAgent,
              text: welcomeText,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isSystemGreeting: true,
            };

            // Optionally store system greeting in Firestore
            const firstMsgRef = doc(db, 'users', uid, 'ai_conversations', activeAgent, 'messages', welcomeMsg.id);
            await setDoc(firstMsgRef, {
              id: welcomeMsg.id,
              sender: welcomeMsg.sender,
              agentId: activeAgent,
              text: welcomeMsg.text,
              createdAt: new Date().toISOString(),
              isSystemGreeting: true,
            });

            // Set conversation doc metadata
            await setDoc(convRef, {
              agentId: activeAgent,
              title: isAr ? AGENT_CONFIG[activeAgent].nameAr : AGENT_CONFIG[activeAgent].name,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastMessageAt: new Date().toISOString(),
            }, { merge: true });

            setMessages([welcomeMsg]);
          } else {
            setMessages(loadedMessages);
          }
        }
      } catch (error) {
        console.error('Failed to load chat history from Firestore:', error);
      } finally {
        if (isMounted) {
          setMessagesLoading(false);
        }
      }
    };

    loadConversation();

    return () => {
      isMounted = false;
    };
  }, [user, activeAgent, isAr]);

  const getIntentForAgent = (agent: AIAgentType): 'coach_chat' | 'auto_budget' | 'debt_plan' | 'fraud_check' | 'savings_hedge' => {
    switch (agent) {
      case 'budget':
        return 'auto_budget';
      case 'savings':
        return 'savings_hedge';
      case 'debt':
        return 'debt_plan';
      case 'fraud':
        return 'fraud_check';
      case 'coach':
      default:
        return 'coach_chat';
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      agent: activeAgent,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Update state immediately
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText('');
    setIsLoading(true);

    try {
      // 1. Save user message to Firestore
      if (user) {
        const uid = user.uid;
        const msgId = userMsg.id;
        const msgRef = doc(db, 'users', uid, 'ai_conversations', activeAgent, 'messages', msgId);
        await setDoc(msgRef, {
          id: msgId,
          sender: userMsg.sender,
          agentId: activeAgent,
          text: userMsg.text,
          createdAt: new Date().toISOString(),
          isSystemGreeting: false,
        });

        // Update conversation metadata
        const convRef = doc(db, 'users', uid, 'ai_conversations', activeAgent);
        await setDoc(convRef, {
          agentId: activeAgent,
          title: isAr ? AGENT_CONFIG[activeAgent].nameAr : AGENT_CONFIG[activeAgent].name,
          updatedAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
        }, { merge: true });
      }

      // 2. Fetch response from server using previous history
      // Filter out system greetings so model doesn't receive them
      const chatHistoryForGemini = messages
        .filter((m) => !m.isSystemGreeting)
        .map((m) => ({
          role: m.sender === 'user' ? (m.sender as 'user') : ('model' as const),
          text: m.text,
        }));

      const response = await apiClient.post('/ai/chat', {
        message: text,
        intent: getIntentForAgent(activeAgent),
        history: chatHistoryForGemini,
      });

      let responseText = isAr ? 'عذراً، لم أتمكن من المعالجة الآن.' : 'Sorry, failed to process request.';
      let isSuccessResponse = false;

      if (response.success && response.answer) {
        responseText = response.answer;
        isSuccessResponse = true;
      } else if (response.answer) {
        responseText = response.answer;
      } else if (response.error) {
        responseText = response.error;
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        agent: activeAgent,
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      // Update state with AI response
      setMessages((prev) => [...prev, aiMsg]);

      // 3. Save AI response to Firestore ONLY if it was a success to avoid permanent memories of service unavailability
      if (user && isSuccessResponse) {
        const uid = user.uid;
        const aiMsgId = aiMsg.id;
        const aiMsgRef = doc(db, 'users', uid, 'ai_conversations', activeAgent, 'messages', aiMsgId);
        await setDoc(aiMsgRef, {
          id: aiMsgId,
          sender: aiMsg.sender,
          agentId: activeAgent,
          text: aiMsg.text,
          createdAt: new Date().toISOString(),
          isSystemGreeting: false,
        });

        // Update conversation metadata
        const convRef = doc(db, 'users', uid, 'ai_conversations', activeAgent);
        await setDoc(convRef, {
          updatedAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
        }, { merge: true });
      }
    } catch (err) {
      console.error('AI chat error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getAgentIcon = (id: AIAgentType) => {
    switch (id) {
      case 'budget':
        return <PieChart className="w-4 h-4" />;
      case 'savings':
        return <PiggyBank className="w-4 h-4" />;
      case 'debt':
        return <ShieldAlert className="w-4 h-4" />;
      case 'fraud':
        return <Lock className="w-4 h-4" />;
      case 'coach':
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-4 pb-20 lg:pb-8 animate-fadeIn h-[calc(100vh-8rem)] flex flex-col" id="ai-advisor-container">
      {/* Top Header & Agent Switcher Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3 shrink-0" id="ai-advisor-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl bg-gradient-to-tr ${currentAgentObj.color} text-white shadow-md`}>
              {getAgentIcon(activeAgent)}
            </div>
            <div>
              <h2 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <span>{isAr ? currentAgentObj.nameAr : currentAgentObj.name}</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                  Gemini Active
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isAr ? currentAgentObj.roleAr : currentAgentObj.role}
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowMemoryModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition"
            id="ai-memory-btn"
          >
            <Database className="w-4 h-4 text-emerald-600" />
            <span>{isAr ? 'ذاكرة AI' : 'AI Memory'}</span>
          </button>
        </div>

        {/* Agents Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar" id="ai-agents-switcher">
          {(Object.values(AGENT_CONFIG) as typeof AGENT_CONFIG[keyof typeof AGENT_CONFIG][]).map((ag) => {
            const isActive = activeAgent === ag.id;
            return (
              <button
                key={ag.id}
                onClick={() => setActiveAgent(ag.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
                id={`agent-tab-${ag.id}`}
              >
                {getAgentIcon(ag.id)}
                <span>{isAr ? ag.nameAr : ag.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages Chat Box */}
      {messagesLoading ? (
        <div className="flex-1 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center items-center space-y-3" id="chat-messages-skeleton">
          <Bot className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-xs text-slate-500 font-bold">
            {isAr ? 'جاري تحميل المحادثة بأمان من السحابة...' : 'Loading secure chat history...'}
          </p>
        </div>
      ) : (
        <div className="flex-1 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-y-auto space-y-4" id="chat-messages-container">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-3 max-w-2xl ${
                m.sender === 'user' ? 'mr-auto ml-0 flex-row-reverse' : ''
              }`}
              id={`chat-message-${m.id}`}
            >
              <div
                className={`p-2 rounded-xl text-white font-bold shrink-0 shadow-sm ${
                  m.sender === 'user' ? 'bg-slate-800' : 'bg-emerald-600'
                }`}
              >
                {m.sender === 'user' ? <LucideUser className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`p-4 rounded-2xl text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-slate-800 text-white rounded-tl-none'
                    : 'bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 text-slate-900 dark:text-slate-100 rounded-tr-none'
                }`}
              >
                <p className="whitespace-pre-line font-medium text-sm leading-relaxed">{m.text}</p>

                <div className="flex items-center justify-between text-[10px] opacity-70 mt-2 pt-1 border-t border-slate-200/40 dark:border-slate-700/40">
                  <span>{m.timestamp}</span>
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-3 max-w-sm" id="chat-loading-indicator">
              <div className="p-2 rounded-xl bg-emerald-600 text-white">
                <Bot className="w-4 h-4 animate-spin" />
              </div>
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 animate-pulse">
                {isAr ? 'جاري التحليل المالي وصياغة النصيحة...' : 'AI thinking...'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggested Prompts Quick Buttons */}
      <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar shrink-0" id="suggested-prompts-row">
        {suggestedPrompts.map((prompt, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(prompt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 text-xs font-bold whitespace-nowrap hover:bg-emerald-100 transition"
            id={`suggested-prompt-${idx}`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>{prompt}</span>
          </button>
        ))}
      </div>

      {/* Input Field Bar */}
      <div className="p-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-2 shrink-0" id="chat-input-bar">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          placeholder={
            isAr
              ? 'اسأل كوتش ميزانية AI أي سؤال عن راتبك، التزاماتك، أو أهدافك...'
              : 'Ask Mizaniya AI anything about your Egyptian finances...'
          }
          className="flex-1 px-4 py-3 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          id="chat-input-field"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isLoading}
          className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold shadow-md transition"
          id="chat-send-btn"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      {/* Memory Inspector Modal */}
      {showMemoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" id="ai-memory-modal">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              <span>{isAr ? 'ذاكرة الذكاء الاصطناعي المسجلة' : 'AI Memory Ledger'}</span>
            </h3>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-2">
              <p className="text-slate-500 text-center py-4">
                {isAr
                  ? 'يتم حفظ تفضيلاتك وسجل معاملاتك تلقائياً في قاعدة البيانات بأمان لمساعدتك بصورة مخصصة.'
                  : 'Your financial preferences and transactions are securely saved in Firestore to personalize responses.'}
              </p>
            </div>

            <button
              onClick={() => setShowMemoryModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs"
              id="close-memory-modal-btn"
            >
              {isAr ? 'إغلاق الذاكرة' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
