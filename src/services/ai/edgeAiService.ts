import { supabase } from '../supabase/supabase';

export interface EdgeAiResult {
  content: string;
  modelId?: string;
}

/**
 * All provider calls go through the authenticated Edge Function.
 * Provider credentials must never be present in VITE_* variables.
 */
export async function callAi<T extends EdgeAiResult = EdgeAiResult>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || 'فشل الاتصال بخدمة الذكاء الاصطناعي');
  }

  if (!data || typeof data.content !== 'string') {
    throw new Error('استجابة غير صالحة من خدمة الذكاء الاصطناعي');
  }

  return data as T;
}
