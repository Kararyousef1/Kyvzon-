/**
 * billing-webhook Edge Function — استقبال webhooks من Stripe
 *
 * الأمان:
 *  - HMAC-SHA256 signature verification (Stripe standard)
 *  - لا CORS — webhooks server-to-server، المتصفحات لا تستدعيه
 *  - Idempotency عبر event_id مع index مخصص
 *  - adminClient بدون session persistence
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ─── HMAC-SHA256 Stripe signature verification ───────────────────────────────
async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  try {
    // Stripe signature format: t=timestamp,v1=signature
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(',')) {
      const [k, v] = part.split('=');
      if (k && v) parts[k.trim()] = v.trim();
    }

    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    // منع replay attacks: لا نقبل webhooks عمرها أكثر من 5 دقائق
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (age > 300) {
      console.warn('billing-webhook: stale webhook rejected (age=%ds)', age);
      return false;
    }

    // Compute expected signature: HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
    const encoder   = new TextEncoder();
    const keyData   = encoder.encode(secret);
    const msgData   = encoder.encode(`${timestamp}.${rawBody}`);
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    const expected  = Array.from(new Uint8Array(sigBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Constant-time comparison
    if (expected.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch (err) {
    console.error('billing-webhook: signature verification error:', err);
    return false;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
    // بدون CORS headers — webhook server-to-server فقط
  });
}

serve(async (req: Request) => {
  // webhooks لا تحتاج OPTIONS — نرفضه صراحةً لمنع browser access
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl      = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret    = Deno.env.get('BILLING_WEBHOOK_SECRET');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('billing-webhook: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }
  if (!webhookSecret) {
    console.error('billing-webhook: BILLING_WEBHOOK_SECRET not set');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  try {
    const rawBody         = await req.text();
    const signatureHeader = req.headers.get('stripe-signature') || req.headers.get('x-webhook-signature') || '';

    // ─── HMAC verification (مفعّل) ────────────────────────────────────────
    const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.warn('billing-webhook: invalid signature rejected');
      return jsonResponse({ error: 'Invalid signature' }, 400);
    }

    const event     = JSON.parse(rawBody);
    const eventId   = String(event.id || `${event.type}-${Date.now()}`);
    const eventType = String(event.type || '');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Idempotency ───────────────────────────────────────────────────────
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

    // ─── Event handling ────────────────────────────────────────────────────
    let result: Record<string, unknown> = { received: true };

    switch (eventType) {
      case 'invoice.paid':
      case 'checkout.session.completed': {
        const tenantId = event.data?.object?.metadata?.tenant_id
          || event.data?.object?.client_reference_id;

        if (tenantId) {
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

          await adminClient.from('tenant_subscriptions').update({
            status: 'active',
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            expires_at: expiresAt,
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
          await adminClient.from('tenant_subscriptions')
            .update({ status: 'cancelled' }).eq('tenant_id', tenantId);
          result = { ...result, tenant_id: tenantId, action: 'suspended' };
        }
        break;
      }

      default:
        result = { ...result, ignored: true, type: eventType };
    }

    // ─── Audit ─────────────────────────────────────────────────────────────
    await adminClient.from('platform_audit_log').insert({
      action: 'billing_webhook',
      category: 'billing',
      target_type: 'tenant',
      details: {
        event_id:   eventId,
        event_type: eventType,
        result,
        raw: event.data?.object ? { id: event.data.object.id } : null,
      },
      description: `Billing webhook ${eventType} -> ${result.action || 'ignored'}`,
    });

    return jsonResponse(result, 200);

  } catch (error) {
    console.error('billing-webhook error:', error instanceof Error ? error.message : String(error));
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});