/**
 * ═════════════════════════════════════════════════════════════════════════
 *  event-payment-webhook — استقبال تأكيد الدفع من Stripe
 *
 *  الدور: Stripe يستدعي هذا الرابط بعد نجاح الدفع (checkout.session.completed).
 *   - يتحقق من توقيع Stripe (STRIPE_WEBHOOK_SECRET) لضمان أن المصدر Stripe فعلاً.
 *   - يستدعي mkt_confirm_event_payment (service role) → يضع التسجيل 'paid'.
 *
 *  هذا رابط عام (Stripe لا يرسل JWT) — الأمان عبر التحقق من التوقيع.
 *  ملاحظة نشر: يجب نشره بـ --no-verify-jwt حتى يصله Stripe بلا توكن مستخدم.
 *
 *  المتغيّرات: STRIPE_WEBHOOK_SECRET · SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// تحقق توقيع Stripe (HMAC-SHA256) — تنفيذ يدوي بلا SDK
async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(sigHeader.split(',').map((kv) => kv.split('=')));
    const timestamp = parts['t'];
    const expected = parts['v1'];
    if (!timestamp || !expected) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
    const computed = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');

    // مقارنة ثابتة الزمن
    if (computed.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 503 });
  }

  const sig = req.headers.get('stripe-signature') || '';
  const rawBody = await req.text();

  const valid = await verifyStripeSignature(rawBody, sig, webhookSecret);
  if (!valid) {
    console.error('Invalid Stripe signature');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(rawBody); } catch { return new Response('Bad payload', { status: 400 }); }

  // نهتم فقط بإتمام جلسة الدفع
  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object || {};
    const sessionId = String(session.id || '');
    const paymentIntent = session.payment_intent ? String(session.payment_intent) : null;

    if (sessionId) {
      try {
        const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
        const { data, error } = await admin.rpc('mkt_confirm_event_payment', {
          p_session_id: sessionId, p_payment_intent: paymentIntent,
        });
        if (error) console.error('confirm payment failed:', error.message);
        else console.log('payment confirmed:', sessionId, 'result:', data);
      } catch (e) { console.error('webhook exception:', e instanceof Error ? e.message : String(e)); }
    }
  }

  // نُرجع 200 دائماً حتى لا يعيد Stripe المحاولة بلا داعٍ (بعد التحقق من التوقيع)
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
