/**
 * billing-webhook Edge Function — استقبال webhooks من Stripe/بوابة دفع عربية
 * جزء من خطة العلاج المرحلة 2 — Billing & Entitlements
 * 
 * يعالج:
 * - invoice.paid → تفعيل/تمديد اشتراك
 * - invoice.payment_failed → grace_period
 * - customer.subscription.deleted → إيقاف
 * - يضبط idempotency عبر event_id
 * - يسجل audit في platform_audit_log
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const webhookSecret = Deno.env.get('BILLING_WEBHOOK_SECRET');

  if (!webhookSecret) {
    console.error('BILLING_WEBHOOK_SECRET not set');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature') || req.headers.get('x-webhook-signature') || '';

    // TODO: تحقق HMAC الحقيقي لـ Stripe
    // const isValid = await verifyStripeSignature(rawBody, signature, webhookSecret);
    // if (!isValid) return jsonResponse({ error: 'Invalid signature' }, 400);

    const event = JSON.parse(rawBody);
    const eventId = event.id || `${event.type}-${Date.now()}`;
    const eventType = event.type as string;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Idempotency — هل عالجنا هذا الحدث من قبل؟
    const { data: existing } = await adminClient
      .from('platform_audit_log')
      .select('id')
      .eq('action', 'billing_webhook')
      .filter('details->>event_id', 'eq', eventId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ received: true, duplicate: true });
    }

    let result: any = { received: true };

    switch (eventType) {
      case 'invoice.paid':
      case 'checkout.session.completed': {
        const customerId = event.data?.object?.customer || event.data?.object?.customer_id;
        const tenantId = event.data?.object?.metadata?.tenant_id || event.data?.object?.client_reference_id;

        if (tenantId) {
          // تمديد الاشتراك
          await adminClient
            .from('tenant_subscriptions')
            .update({
              status: 'active',
              payment_status: 'paid',
              paid_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // +30 يوم
            })
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(1);

          await adminClient.from('tenants').update({ status: 'active' }).eq('id', tenantId);

          result = { ...result, tenant_id: tenantId, action: 'subscription_activated' };
        }
        break;
      }

      case 'invoice.payment_failed': {
        const tenantId = event.data?.object?.metadata?.tenant_id;
        if (tenantId) {
          await adminClient.from('tenant_subscriptions').update({
            status: 'grace_period',
            payment_status: 'failed',
          }).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1);
          result = { ...result, tenant_id: tenantId, action: 'grace_period' };
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const tenantId = event.data?.object?.metadata?.tenant_id;
        if (tenantId) {
          await adminClient.from('tenants').update({ status: 'suspended' }).eq('id', tenantId);
          await adminClient.from('tenant_subscriptions').update({ status: 'cancelled' }).eq('tenant_id', tenantId);
          result = { ...result, tenant_id: tenantId, action: 'suspended' };
        }
        break;
      }

      default:
        result = { ...result, ignored: true, type: eventType };
    }

    // Audit
    await adminClient.from('platform_audit_log').insert({
      action: 'billing_webhook',
      category: 'billing',
      target_type: 'tenant',
      details: {
        event_id: eventId,
        event_type: eventType,
        result,
        raw: event.data?.object ? { id: event.data.object.id } : null,
      },
      description: `Billing webhook ${eventType} -> ${result.action || 'ignored'}`,
    });

    return jsonResponse(result, 200);
  } catch (error) {
    console.error('billing-webhook error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
