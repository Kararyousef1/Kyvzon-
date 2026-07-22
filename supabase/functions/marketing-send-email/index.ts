/**
 * ═════════════════════════════════════════════════════════════════════════
 *  marketing-send-email — إرسال البريد الفعلي عبر مزوّد (Resend)
 *
 *  الدور: الوسيط الآمن بين بوابة التسويق ومزوّد البريد.
 *   - يستقبل طلب إرسال من مستخدم مُصادَق (JWT) داخل شركته.
 *   - يقرأ مفتاح المزوّد من Supabase Secrets (لا يُكشف للواجهة أبداً).
 *   - يرسل عبر Resend API ويُرجع النتيجة (نجاح/فشل + معرّف الرسالة).
 *
 *  الأمان: نفس سياسة CORS المُشدّدة (APP_ORIGIN/localhost) + مصادقة JWT.
 *  إن لم يوجد RESEND_API_KEY → يعيد وضع 'simulated' (توافق عكسي مع المحاكاة).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── CORS (نفس منطق _shared/adminAuth الموحّد والآمن) ───────────────────────
function isProduction(): boolean {
  return (Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') || 'production') === 'production';
}
function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  const allowlist = (Deno.env.get('APP_ORIGIN') || '').split(',').map((o) => o.trim()).filter(Boolean);
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
  if (origin && allowlist.includes(origin)) return origin;
  if (origin && isLocal && !isProduction()) return origin;
  return '';
}
function headers(req: Request): Record<string, string> {
  const origin = resolveAllowedOrigin(req);
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
  if (origin) base['Access-Control-Allow-Origin'] = origin;
  return base;
}
function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

interface SendPayload {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  text?: unknown;
  from?: unknown;         // اختياري: افتراضي RESEND_FROM أو onboarding@resend.dev
  campaign_id?: unknown;  // اختياري: لتسجيل الحدث في email_events
  subscriber_id?: unknown;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  // سياسة أصل مُشدّدة
  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req) === '') {
    return json(req, { error: 'Origin not allowed' }, 403);
  }

  // ─── مصادقة المستخدم (JWT) ───────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !authorization?.startsWith('Bearer ')) {
    return json(req, { error: 'Authentication or configuration missing' }, 503);
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);

  // التحقق أن المستخدم له صلاحية تسويق (marketing/admin/developer)
  const { data: profile } = await userClient
    .from('profiles').select('role, tenant_id').eq('id', authData.user.id).single();
  const allowedRoles = new Set(['marketing', 'admin', 'developer', 'it_admin']);
  if (!profile || !allowedRoles.has(String(profile.role))) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية تسويق' }, 403);
  }

  // ─── قراءة الحمولة ───────────────────────────────────────────────────────
  let payload: SendPayload;
  try { payload = await req.json() as SendPayload; }
  catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }

  const to = String(payload.to || '').trim();
  const subject = String(payload.subject || '').trim();
  const html = typeof payload.html === 'string' ? payload.html : undefined;
  const text = typeof payload.text === 'string' ? payload.text : undefined;
  if (!to || !subject || (!html && !text)) {
    return json(req, { error: 'الحقول المطلوبة: to, subject, و (html أو text)' }, 400);
  }

  // ─── مفتاح المزوّد ───────────────────────────────────────────────────────
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const fromDefault = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev';
  const from = String(payload.from || fromDefault);

  // بلا مفتاح → وضع محاكاة (توافق عكسي، لا يفشل)
  if (!resendKey) {
    return json(req, {
      mode: 'simulated',
      message: 'لم يُضبط RESEND_API_KEY — تم تسجيل الإرسال كمحاكاة. أضف المفتاح للإرسال الفعلي.',
    }, 200);
  }

  // ─── الإرسال الفعلي عبر Resend ───────────────────────────────────────────
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, ...(html ? { html } : {}), ...(text ? { text } : {}) }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('Resend error:', res.status, JSON.stringify(body));
      return json(req, { mode: 'live', ok: false, status: res.status, error: body?.message || 'فشل الإرسال عبر المزوّد' }, 502);
    }

    // تسجيل الحدث في email_events (اختياري — إن توفّر campaign_id) عبر service role
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceKey && payload.campaign_id) {
      try {
        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
        await admin.from('email_events').insert({
          tenant_id: profile.tenant_id,
          campaign_id: String(payload.campaign_id),
          subscriber_id: payload.subscriber_id ? String(payload.subscriber_id) : null,
          event_type: 'sent',
          provider_message_id: body?.id || null,
          created_at: new Date().toISOString(),
        });
      } catch (e) { console.warn('email_events insert failed:', e instanceof Error ? e.message : String(e)); }
    }

    return json(req, { mode: 'live', ok: true, id: body?.id || null }, 200);
  } catch (error) {
    console.error('marketing-send-email exception:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي أثناء الإرسال' }, 500);
  }
});
