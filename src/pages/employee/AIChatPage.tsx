import { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, Trash2, Copy, Check } from 'lucide-react';
import { useUIStore, useAuthStore } from '../../core/stores';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { settingsService } from '../../services/sdk/SettingsService';
import { callAi } from '../../services/ai/edgeAiService';

// النماذج المسموح بها؛ المفاتيح والمناداة الفعلية تبقى داخل Edge Function.
const AI_MODELS: Record<string, { name: string; modelId: string }> = {
  deepseek: { name: 'DeepSeek V3', modelId: 'deepseek/deepseek-chat' },
  groq: { name: 'Groq Llama 3', modelId: 'llama-3.3-70b-versatile' },
  gpt4o: { name: 'GPT-4o Mini', modelId: 'openai/gpt-4o-mini' },
};

// تجربة النماذج بالتتابع دون كشف أي provider key للمتصفح.
async function tryAIWithFallback(
  messages: { role: string; content: string }[],
  preferredModel: string,
): Promise<{ content: string; modelId: string }> {
  const order = [preferredModel, 'gpt4o', 'groq', 'deepseek'];
  const tried = new Set<string>();

  for (const modelId of order) {
    if (tried.has(modelId) || !AI_MODELS[modelId]) continue;
    tried.add(modelId);
    try {
      const result = await callAi({
        task: 'chat',
        preferredModel: AI_MODELS[modelId].modelId,
        messages,
      });
      return { content: result.content, modelId };
    } catch (error) {
      console.warn(`AI model ${modelId} failed`, error);
    }
  }

  return {
    content: '⚠️ عذراً، خدمة الذكاء الاصطناعي غير متوفرة حالياً. يرجى المحاولة لاحقاً.',
    modelId: 'none',
  };
}

const suggestions = [
  'كيف أرفع مشكلة عمل بشكل فعّال؟',
  'ما هي حقوقي كموظف في الإجازات؟',
  'كيف أتحدث مع مديري عن رفع الراتب؟',
  'كيف أتعامل مع ضغط العمل والإجهاد؟',
  'ما هي خطوات تقييم الأداء السنوي؟',
];

export default function AIChatPage() {
  const { chatMessages, addChatMessage, clearChat, addToast } = useUIStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState('gpt4o'); // النموذج الافتراضي
  const [currentModelName, setCurrentModelName] = useState('GPT-4o Mini');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // جلب النموذج النشط عبر طبقة SDK الآمنة (لا وصول مباشر لـ system_settings)
  useEffect(() => {
    const loadModel = async () => {
      try {
        // المسار الآمن: يمر عبر BaseService + RLS (staff فقط). للموظفين يفشل بهدوء ويستخدم الافتراضي.
        const aiSettings = await settingsService.findAiSettings().catch(() => null) as { activeModel?: string } | null;
        // ★ المرحلة 1: نوع بنيوي — activeModel وحده هو المقروء
    const modelId = (aiSettings as { activeModel?: string } | null | undefined)?.activeModel;
        if (modelId && AI_MODELS[modelId]) {
          setActiveModel(modelId);
          setCurrentModelName(AI_MODELS[modelId].name);
        } else {
          setActiveModel('gpt4o');
          setCurrentModelName('GPT-4o Mini');
        }
      } catch (err) {
        console.warn('Failed to load AI config, using default:', err);
        setActiveModel('gpt4o');
        setCurrentModelName('GPT-4o Mini');
      }
    };
    loadModel();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { id: Date.now().toString(), role: 'user' as const, content: msg, timestamp: new Date().toISOString() };
    addChatMessage(userMsg);
    setLoading(true);

    const currentHistory = [...chatMessages, userMsg];
    const result = await tryAIWithFallback(currentHistory, activeModel);
    
    // تحديث اسم النموذج المستخدم فعلياً
    const usedConfig = AI_MODELS[result.modelId];
    if (usedConfig) setCurrentModelName(usedConfig.name);
    
    const aiMsg = { id: (Date.now() + 1).toString(), role: 'assistant' as const, content: result.content, timestamp: new Date().toISOString() };
    addChatMessage(aiMsg);
    setLoading(false);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    addToast('تم نسخ النص', 'success');
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Kyvzon AI</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-slate-500">مدعوم بـ {currentModelName}</span>
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />}
          onClick={() => { clearChat(); addToast('تم مسح المحادثة', 'info'); }}>
          مسح
        </Button>
      </div>

      {/* Messages */}
      <Card padding="none" className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <Sparkles size={28} className="text-white" />
              </div>
              <h3 className="font-bold text-slate-700 mb-1">Kyvzon AI</h3>
              <p className="text-xs text-slate-400 mb-6">اسألني أي شيء عن حقوقك أو مشاكل العمل</p>
              <div className="space-y-2 text-right max-w-md mx-auto">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => handleSend(s)}
                    className="block w-full text-right bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:text-indigo-700 transition-all cursor-pointer">
                    💬 {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {chatMessages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold text-xs'
                  : 'bg-gradient-to-br from-slate-700 to-slate-900'
              }`}>
                {msg.role === 'user' ? ((user?.name || user?.full_name || 'أ').charAt(0)) : <Bot size={14} className="text-white" />}
              </div>
              <div className="max-w-[75%] group">
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'
                }`}>
                  {msg.content}
                </div>
                <div className={`flex items-center gap-2 mt-1 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {msg.timestamp ? format(new Date(msg.timestamp), 'HH:mm', { locale: ar }) : ''}
                  </span>
                  {msg.role === 'assistant' && (
                    <button onClick={() => handleCopy(msg.content, msg.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-400 hover:text-slate-600">
                      {copied === msg.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center flex-shrink-0">
                <Bot size={14} className="text-white" />
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="اكتب سؤالك هنا... (Enter للإرسال)"
              className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder-slate-400"
            />
            <button onClick={() => handleSend()} disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white disabled:opacity-40 hover:from-indigo-600 hover:to-purple-700 transition-all">
              <Send size={14} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}