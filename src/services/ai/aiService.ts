import { callAi } from './edgeAiService';

/**
 * AI application service.
 * Provider credentials and system instructions stay on the Edge Function.
 */

export async function sendMessage(
  messages: { role: string; content: string }[],
  userInfo?: { name?: string; role?: string; department?: string },
): Promise<string> {
  try {
    const result = await callAi({
      task: 'chat',
      messages,
      userInfo,
      preferredModel: 'llama-3.3-70b-versatile',
    });
    return result.content;
  } catch (error) {
    console.error('Kyvzon AI Error:', error);
    return 'عذراً، حدث خطأ أثناء الاتصال. يرجى المحاولة مرة أخرى.';
  }
}

export async function testConnection(): Promise<{ success: boolean; message: string; latency?: string }> {
  const startTime = performance.now();
  try {
    const result = await callAi({
      task: 'health',
      preferredModel: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'health check' }],
    });
    const latency = `${((performance.now() - startTime) / 1000).toFixed(2)}s`;
    return {
      success: result.content === 'ok',
      message: result.content === 'ok'
        ? `✅ الخدمة تعمل. وقت الاستجابة: ${latency}`
        : '⚠️ استجابة غير متوقعة من الخدمة.',
      latency,
    };
  } catch (error) {
    return {
      success: false,
      message: `❌ فشل الاتصال: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`,
    };
  }
}

export async function getSmartSuggestions(userRole?: string): Promise<string[]> {
  const suggestions: Record<string, string[]> = {
    employee: [
      '💬 كيف أرفع مشكلة عمل؟',
      '📋 ما هي حقوقي في الإجازات؟',
      '🧘 كيف أتعامل مع ضغط العمل؟',
      '📊 ما هي خطوات تقييم الأداء؟',
      '🎯 كيف أطور مساري المهني؟',
    ],
    hr: [
      '📊 كيف أحلل مشاكل الموظفين؟',
      '👥 كيف أدير طلبات الإجازة؟',
      '📈 كيف أحسن رضا الموظفين؟',
      '🎓 كيف أنظم دورة تدريبية؟',
      '🏆 كيف أستخدم سوق المواهب؟',
    ],
    admin: [
      '⚙️ كيف أضيف مستخدم جديد؟',
      '🔑 كيف أدير صلاحيات المستخدمين؟',
      '📋 كيف أشاهد سجل التدقيقات؟',
      '🎨 كيف أعدل صفحة الهبوط؟',
      '🤖 كيف أضبط إعدادات الذكاء الاصطناعي؟',
    ],
  };

  return suggestions[userRole || 'employee'] || suggestions.employee;
}
