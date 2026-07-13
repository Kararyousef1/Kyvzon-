/**
 * ════════════════════════════════════════════════════════════════
 *  Supabase Client - عميل Supabase الموحد (Single Source of Truth)
 *  ⚠️ هذا هو الملف الوحيد لإنشاء عميل Supabase في النظام بأكمله
 *  لا تنشئ ملفات أخرى لـ createClient!
 * ════════════════════════════════════════════════════════════════
 *
 *  ملاحظات فنية:
 *  - لا تستورد من './client.ts' — هذا الملف هو المصدر الوحيد
 *  - realtime.eventsPerSecond = 10 يحد من ضغط Realtime
 *  - autoRefreshToken + persistSession = true للجلسات المستمرة
 *  - تخزين الجلسة في localStorage لاستمراريتها عبر علامات التبويب
 *  - x-app-name في headers لتعريف الطلبات في Supabase Logs
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '❌ Supabase environment variables missing!\n' +
    'تأكد من وجود VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      'x-app-name': 'hr-system',
    },
  },
});

// تسجيل أحداث المصادقة (بيئة التطوير فقط)
supabase.auth.onAuthStateChange((event, session) => {
  if (import.meta.env.DEV) {
    switch (event) {
      case 'SIGNED_IN':
        console.log('🔐 Auth: Signed in', session?.user?.email);
        break;
      case 'SIGNED_OUT':
        console.log('🔐 Auth: Signed out');
        break;
      case 'TOKEN_REFRESHED':
        console.log('🔐 Auth: Token refreshed');
        break;
      case 'USER_UPDATED':
        console.log('🔐 Auth: User updated');
        break;
    }
  }
});

export default supabase;
