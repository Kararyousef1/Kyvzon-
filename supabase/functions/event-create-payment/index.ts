/**
 * ═════════════════════════════════════════════════════════════════════════
 *  event-create-payment — إنشاء جلسة دفع Stripe لتذكرة فعالية
 *
 *  الدور: الوسيط الآمن بين البوابة وStripe (نفس نمط البريد/الرسائل).
 *   - مستخدم مُصادَق (JWT) بصلاحية تسويق يطلب دفع تسجيل معيّن.
 *   - يقرأ STRIPE_SECRET_KEY من Secrets، يُنشئ Checkout Session، يسجّل النية.
 *   - يعيد رابط الدفع (url) لتوجيه العميل إليه.
 *
 *  بلا STRIPE_SECRET_KEY → يعيد mode='simulated' (لا يفشل، توافق عكسي).
 *  المتغيّرات: STRIPE_SECRET_KEY · APP_ORIGIN (لروابط النجاح/الإلغاء).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

interface Payload { registration_id?: unknown; }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req) === '') return json(req, { error: 'Origin not allowed' }, 403);

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
  const { data: profile } = await userClient.from('profiles').select('role').eq('id', authData.user.id).single();
  if (!profile || !['marketing', 'admin', 'developer', 'it_admin'].includes(String(profile.role))) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية تسويق' }, 403);
  }

  let payload: Payload;
  try { payload = await req.json() as Payload; } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const registrationId = String(payload.registration_id || '');
  if (!registrationId) return json(req, { error: 'registration_id مطلوب' }, 400);

  // بيانات التسجيل (عبر عميل المستخدم — RLS يضمن العزل)
  const { data: reg, error: regErr } = await userClient
    .from('event_registrations')
    .select('id, email, amount_paid, ticket_type_id, event_id')
    .eq('id', registrationId).single();
  if (regErr || !reg) return json(req, { error: 'التسجيل غير موجود' }, 404);

  // السعر من نوع التذكرة (أدق من amount_paid)
  let amount = Number(reg.amount_paid || 0);
  let currency = 'usd';
  if (reg.ticket_type_id) {
    const { data: tt } = await userClient.from('event_ticket_types').select('price, currency').eq('id', reg.ticket_type_id).single();
    if (tt) { amount = Number(tt.price || amount); currency = String(tt.currency || 'usd').toLowerCase(); }
  }
  if (amount <= 0) return json(req, { error: 'لا مبلغ مستحق (تذكرة مجانية)' }, 400);

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    return json(req, { mode: 'simulated', message: 'لم يُضبط STRIPE_SECRET_KEY — الدفع بوضع محاكاة. أضف المفتاح للتفعيل.' }, 200);
  }

  const appOrigin = (Deno.env.get('APP_ORIGIN') || requestOrigin || 'http://localhost:5173').split(',')[0].trim();

  try {
    // إنشاء Stripe Checkout Session عبر REST (بلا SDK — form-encoded)
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${appOrigin}/app/marketing/events?payment=success`);
    form.set('cancel_url', `${appOrigin}/app/marketing/events?payment=cancel`);
    form.set('client_reference_id', registrationId);
    if (reg.email) form.set('customer_email', String(reg.email));
    form.set('line_items[0][price_data][currency]', currency);
    form.set('line_items[0][price_data][product_data][name]', 'تذكرة فعالية Kyvzon');
    form.set('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
    form.set('line_items[0][quantity]', '1');
    form.set('metadata[registration_id]', registrationId);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const session = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Stripe error:', res.status, JSON.stringify(session));
      return json(req, { mode: 'live', ok: false, status: res.status, error: session?.error?.message || 'فشل إنشاء جلسة الدفع' }, 502);
    }

    // تسجيل نية الدفع
    try { await userClient.rpc('mkt_record_event_payment_intent', { p_registration_id: registrationId, p_session_id: session.id, p_amount: amount, p_currency: currency }); }
    catch (e) { console.warn('intent record failed:', e instanceof Error ? e.message : String(e)); }

    return json(req, { mode: 'live', ok: true, url: session.url, session_id: session.id }, 200);
  } catch (error) {
    console.error('event-create-payment exception:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي أثناء إنشاء الدفع' }, 500);
  }
});
