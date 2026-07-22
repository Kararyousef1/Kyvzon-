/**
 * ═════════════════════════════════════════════════════════════════════════
 *  marketing-send-sms — إرسال SMS/واتساب الفعلي عبر مزوّد (Twilio)
 *
 *  الدور: الوسيط الآمن بين بوابة التسويق ومزوّد الرسائل (نفس نمط البريد).
 *   - يستقبل طلب إرسال من مستخدم مُصادَق (JWT) بصلاحية تسويق.
 *   - يقرأ مفاتيح Twilio من Supabase Secrets (لا تُكشف للواجهة).
 *   - يرسل عبر Twilio API (SMS أو واتساب) ويُرجع النتيجة.
 *
 *  الأمان: CORS مُشدّد + مصادقة JWT + تحقق الدور.
 *  بلا مفاتيح Twilio → يعيد 'simulated' (توافق عكسي مع المحاكاة، لا يفشل).
 *
 *  المتغيّرات المطلوبة (Secrets) عند التفعيل الفعلي:
 *    TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN
 *    TWILIO_SMS_FROM       (رقم المرسِل للـ SMS، مثل +1234567890)
 *    TWILIO_WHATSAPP_FROM  (رقم واتساب المعتمد، مثل whatsapp:+1234567890)
 * ═════════════════════════════════════════════════════════════════════════
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── CORS (نفس المنطق الموحّد الآمن) ────────────────────────────────────────
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
  to?: unknown;          // رقم المستلم (E.164، مثل +9647701234567)
  body?: unknown;        // نص الرسالة
  channel?: unknown;     // 'sms' | 'whatsapp'
  message_id?: unknown;  // اختياري: لتحديث الحالة في messaging_messages
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req) === '') {
    return json(req, { error: 'Origin not allowed' }, 403);
  }

  // ─── مصادقة المستخدم (JWT) + تحقق الدور ──────────────────────────────────
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

  const { data: profile } = await userClient
    .from('profiles').select('role, tenant_id').eq('id', authData.user.id).single();
  const allowedRoles = new Set(['marketing', 'admin', 'developer', 'it_admin']);
  if (!profile || !allowedRoles.has(String(profile.role))) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية تسويق' }, 403);
  }

  // ─── الحمولة ─────────────────────────────────────────────────────────────
  let payload: SendPayload;
  try { payload = await req.json() as SendPayload; }
  catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }

  const to = String(payload.to || '').trim();
  const messageBody = String(payload.body || '').trim();
  const channel = String(payload.channel || 'sms');
  if (!to || !messageBody || !['sms', 'whatsapp'].includes(channel)) {
    return json(req, { error: 'الحقول المطلوبة: to, body, channel (sms|whatsapp)' }, 400);
  }

  // ─── مفاتيح Twilio ───────────────────────────────────────────────────────
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const smsFrom = Deno.env.get('TWILIO_SMS_FROM');
  const waFrom = Deno.env.get('TWILIO_WHATSAPP_FROM');

  // بلا مفاتيح → وضع محاكاة (لا يفشل)
  if (!sid || !token || (channel === 'sms' && !smsFrom) || (channel === 'whatsapp' && !waFrom)) {
    return json(req, {
      mode: 'simulated',
      message: 'لم تُضبط مفاتيح Twilio — تم تسجيل الإرسال كمحاكاة. أضف المفاتيح للإرسال الفعلي.',
    }, 200);
  }

  // ─── الإرسال الفعلي عبر Twilio ───────────────────────────────────────────
  const from = channel === 'whatsapp' ? String(waFrom) : String(smsFrom);
  const toAddr = channel === 'whatsapp' ? `whatsapp:${to}` : to;
  try {
    const form = new URLSearchParams();
    form.set('To', toAddr);
    form.set('From', from);
    form.set('Body', messageBody);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${sid}:${token}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('Twilio error:', res.status, JSON.stringify(data));
      return json(req, { mode: 'live', ok: false, status: res.status, error: data?.message || 'فشل الإرسال عبر Twilio' }, 502);
    }

    // تحديث حالة الرسالة في DB (اختياري) عبر service role
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceKey && payload.message_id) {
      try {
        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
        await admin.from('messaging_messages')
          .update({ status: 'sent', delivery_mode: 'live', provider_message_id: data?.sid || null })
          .eq('id', String(payload.message_id))
          .eq('tenant_id', profile.tenant_id);
      } catch (e) { console.warn('messaging_messages update failed:', e instanceof Error ? e.message : String(e)); }
    }

    return json(req, { mode: 'live', ok: true, sid: data?.sid || null }, 200);
  } catch (error) {
    console.error('marketing-send-sms exception:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي أثناء الإرسال' }, 500);
  }
});
