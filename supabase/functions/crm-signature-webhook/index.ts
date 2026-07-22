/**
 * ═════════════════════════════════════════════════════════════════════════
 *  crm-signature-webhook — استقبال إشعار اكتمال التوقيع من DocuSign (Connect)
 *
 *  الدور: DocuSign يستدعي هذا الرابط عند تغيّر حالة الظرف (envelope-completed).
 *   - يتحقق من سرّ مشترك بسيط (DOCUSIGN_WEBHOOK_SECRET) في الترويسة أو الاستعلام.
 *   - عند اكتمال التوقيع → crm_confirm_signature (service role) يختم العرض + عقد.
 *
 *  رابط عام (DocuSign لا يرسل JWT) — يُنشر بـ --no-verify-jwt.
 *  المتغيّرات: DOCUSIGN_WEBHOOK_SECRET · SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY.
 *
 *  ملاحظة: DocuSign Connect يدعم HMAC؛ للتبسيط نستخدم سرّاً مشتركاً في المسار
 *  (?secret=) أو ترويسة x-webhook-secret — يُوصى بترقيته لـ HMAC في الإنتاج.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const webhookSecret = Deno.env.get('DOCUSIGN_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), { status: 503 });
  }

  // تحقق السرّ المشترك (ترويسة أو استعلام)
  const url = new URL(req.url);
  const provided = req.headers.get('x-webhook-secret') || url.searchParams.get('secret') || '';
  if (provided !== webhookSecret) {
    console.error('Invalid webhook secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { /* قد يرسل DocuSign XML؛ نتعامل مع JSON فقط هنا */ }

  // استخلاص envelopeId والحالة (بنية DocuSign Connect JSON)
  const data = (body?.data ?? body) as Record<string, unknown>;
  const envelopeId = String(data?.envelopeId || (data?.envelopeSummary as Record<string, unknown>)?.envelopeId || '');
  const status = String(data?.envelopeStatus || body?.event || (data?.envelopeSummary as Record<string, unknown>)?.status || '').toLowerCase();

  if (envelopeId && (status === 'completed' || status === 'envelope-completed')) {
    try {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
      const { data: result, error } = await admin.rpc('crm_confirm_signature', {
        p_envelope_id: envelopeId, p_signer_ip: null,
      });
      if (error) console.error('confirm signature failed:', error.message);
      else console.log('signature confirmed:', envelopeId, 'result:', result);
    } catch (e) { console.error('webhook exception:', e instanceof Error ? e.message : String(e)); }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
