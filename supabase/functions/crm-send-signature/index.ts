/**
 * ═════════════════════════════════════════════════════════════════════════
 *  crm-send-signature — إرسال عرض CRM للتوقيع الإلكتروني عن بُعد (DocuSign)
 *
 *  الدور: الوسيط الآمن بين البوابة وDocuSign.
 *   - مستخدم مُصادَق (JWT) بصلاحية مبيعات/إدارة يطلب إرسال عرض للتوقيع.
 *   - ينشئ DocuSign Envelope (مستند العرض + موقّع)، يسجّل الطلب في DB.
 *   - يعيد envelope_id (وحالة الإرسال).
 *
 *  المصادقة: DocuSign JWT Grant (Server-to-Server) عبر:
 *    DOCUSIGN_INTEGRATION_KEY · DOCUSIGN_USER_ID · DOCUSIGN_ACCOUNT_ID
 *    DOCUSIGN_PRIVATE_KEY (RSA) · DOCUSIGN_BASE_URI (مثل https://demo.docusign.net)
 *    DOCUSIGN_OAUTH_BASE (account-d.docusign.com للتجربة / account.docusign.com للإنتاج)
 *
 *  بلا مفاتيح DocuSign → mode='simulated' (استخدم التوقيع الداخلي crm_sign_quote).
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

// ─── DocuSign JWT Grant (الحصول على access token) ────────────────────────────
async function importPkcs8(pem: string): Promise<CryptoKey> {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
function b64url(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getDocusignToken(): Promise<string | null> {
  const integrationKey = Deno.env.get('DOCUSIGN_INTEGRATION_KEY');
  const userId = Deno.env.get('DOCUSIGN_USER_ID');
  const privateKey = Deno.env.get('DOCUSIGN_PRIVATE_KEY');
  const oauthBase = Deno.env.get('DOCUSIGN_OAUTH_BASE') || 'account-d.docusign.com';
  if (!integrationKey || !userId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: integrationKey, sub: userId, aud: oauthBase, iat: now, exp: now + 3600, scope: 'signature impersonation',
  }));
  const key = await importPkcs8(privateKey);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch(`https://${oauthBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? (data.access_token || null) : null;
}

interface Payload { quote_id?: unknown; signer_email?: unknown; signer_name?: unknown; }

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
  if (!profile || !['sales', 'admin', 'developer', 'it_admin'].includes(String(profile.role))) {
    return json(req, { error: 'غير مخوّل — يتطلب صلاحية مبيعات/إدارة' }, 403);
  }

  let payload: Payload;
  try { payload = await req.json() as Payload; } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const quoteId = String(payload.quote_id || '');
  const signerEmail = String(payload.signer_email || '');
  const signerName = String(payload.signer_name || '');
  if (!quoteId || !signerEmail) return json(req, { error: 'quote_id و signer_email مطلوبان' }, 400);

  const { data: quote, error: qErr } = await userClient
    .from('crm_quotes').select('id, title, quote_number, total, currency').eq('id', quoteId).single();
  if (qErr || !quote) return json(req, { error: 'العرض غير موجود' }, 404);

  const token = await getDocusignToken();
  const accountId = Deno.env.get('DOCUSIGN_ACCOUNT_ID');
  const baseUri = Deno.env.get('DOCUSIGN_BASE_URI') || 'https://demo.docusign.net';
  if (!token || !accountId) {
    return json(req, { mode: 'simulated', message: 'لم تُضبط مفاتيح DocuSign — استخدم التوقيع الداخلي. أضف DOCUSIGN_* للتوقيع عن بُعد.' }, 200);
  }

  try {
    // مستند بسيط (نص العرض) — في الإنتاج يُستبدل بـ PDF مولّد
    const docContent = `عرض سعر: ${quote.title}\nرقم: ${quote.quote_number}\nالإجمالي: ${quote.total} ${quote.currency}\n\nبالتوقيع أدناه، توافق على شروط هذا العرض.`;
    const docBase64 = b64url(docContent).replace(/-/g, '+').replace(/_/g, '/'); // DocuSign يريد base64 عادي
    const docB64Std = btoa(unescape(encodeURIComponent(docContent)));

    const envelope = {
      emailSubject: `توقيع عرض Kyvzon: ${quote.title}`,
      documents: [{ documentBase64: docB64Std, name: quote.title, fileExtension: 'txt', documentId: '1' }],
      recipients: {
        signers: [{
          email: signerEmail, name: signerName || signerEmail, recipientId: '1', routingOrder: '1',
          tabs: { signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '100', yPosition: '150' }] },
        }],
      },
      status: 'sent',
    };
    void docBase64;

    const res = await fetch(`${baseUri}/restapi/v2.1/accounts/${accountId}/envelopes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.envelopeId) {
      console.error('DocuSign envelope error:', res.status, JSON.stringify(data));
      return json(req, { mode: 'live', ok: false, status: res.status, error: data?.message || 'تعذّر إنشاء ظرف التوقيع' }, 502);
    }

    // تسجيل الطلب
    try { await userClient.rpc('crm_record_signature_request', { p_quote_id: quoteId, p_envelope_id: data.envelopeId, p_signer_name: signerName, p_signer_email: signerEmail }); }
    catch (e) { console.warn('record signature request failed:', e instanceof Error ? e.message : String(e)); }

    return json(req, { mode: 'live', ok: true, envelope_id: data.envelopeId }, 200);
  } catch (error) {
    console.error('crm-send-signature exception:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي أثناء إرسال التوقيع' }, 500);
  }
});
