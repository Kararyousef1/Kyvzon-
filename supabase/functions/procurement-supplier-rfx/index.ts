/**
 * procurement-supplier-rfx — بوابة المورد لتقديم عروض RFx وطرح الأسئلة
 * Public token function for rfx_supplier_invitations.
 */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function isProduction(): boolean { return (Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') || 'production') === 'production'; }
function resolveAllowedOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  const allowlist = (Deno.env.get('APP_ORIGIN') || '').split(',').map(o=>o.trim()).filter(Boolean);
  const isLocal = origin.includes('localhost') || origin.includes('127.0.0.1');
  if (origin && allowlist.includes(origin)) return origin;
  if (origin && isLocal && !isProduction()) return origin;
  return '';
}
function headers(req: Request): Record<string,string> {
  const origin = resolveAllowedOrigin(req);
  const base: Record<string,string> = {'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'};
  if (origin) base['Access-Control-Allow-Origin'] = origin;
  return base;
}
function json(req: Request, body: unknown, status=200): Response { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
async function sha256Hex(value: string): Promise<string> { const data = new TextEncoder().encode(value); const hash = await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
function asText(v: unknown, max=1000): string | null { if (v===undefined || v===null) return null; const s=String(v).trim(); return s ? s.slice(0,max) : null; }
function asNum(v: unknown): number { const n=Number(v); if (!Number.isFinite(n)) throw new Error('INVALID_NUMBER'); return n; }

serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method!=='POST') return json(req, { error: 'Method not allowed' }, 405);
  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req)==='') return json(req, { error: 'Origin not allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(req, { error: 'Service not configured' }, 503);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }
  const action = String(body.action || 'verify');
  const token = String(body.token || '').trim();
  if (!token || token.length < 32 || token.length > 200) return json(req, { error: 'رابط RFx غير صالح' }, 400);

  const tokenHash = await sha256Hex(token);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: inv, error: invError } = await admin.from('rfx_supplier_invitations').select('*').eq('token_hash', tokenHash).maybeSingle();
  if (invError) return json(req, { error: 'تعذر التحقق من الدعوة' }, 500);
  if (!inv) return json(req, { error: 'الدعوة غير موجودة' }, 404);
  if (['cancelled','expired','declined'].includes(inv.status)) return json(req, { error: 'الدعوة غير فعالة' }, 410);
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    await admin.from('rfx_supplier_invitations').update({ status: 'expired' }).eq('id', inv.id);
    return json(req, { error: 'انتهت صلاحية الدعوة' }, 410);
  }

  if (action === 'verify') {
    await admin.from('rfx_supplier_invitations').update({ status: inv.status === 'invited' ? 'viewed' : inv.status, viewed_at: inv.viewed_at || new Date().toISOString() }).eq('id', inv.id);
    const [{ data: event }, { data: lines }, { data: questions }, { data: bids }, { data: supplier }] = await Promise.all([
      admin.from('sourcing_events').select('*').eq('id', inv.event_id).eq('tenant_id', inv.tenant_id).single(),
      admin.from('rfx_line_items').select('*').eq('event_id', inv.event_id).eq('tenant_id', inv.tenant_id),
      admin.from('rfx_questions').select('id, question, answer, visibility, status, created_at, answered_at').eq('event_id', inv.event_id).eq('tenant_id', inv.tenant_id).or(`visibility.eq.all_suppliers,supplier_id.eq.${inv.supplier_id}`).order('created_at', { ascending: false }),
      admin.from('supplier_bids').select('*').eq('event_id', inv.event_id).eq('supplier_id', inv.supplier_id).eq('tenant_id', inv.tenant_id),
      admin.from('suppliers').select('id, legal_name, supplier_code, status').eq('id', inv.supplier_id).eq('tenant_id', inv.tenant_id).single(),
    ]);
    return json(req, { ok: true, invitation: inv, event, lines: lines || [], questions: questions || [], bids: bids || [], supplier });
  }

  if (action === 'ask_question') {
    const question = asText(body.question, 2000);
    if (!question) return json(req, { error: 'السؤال مطلوب' }, 400);
    const { data, error } = await admin.from('rfx_questions').insert({ tenant_id: inv.tenant_id, event_id: inv.event_id, supplier_id: inv.supplier_id, question, visibility: 'all_suppliers', status: 'open' }).select('id').single();
    if (error) return json(req, { error: 'تعذر إرسال السؤال' }, 500);
    return json(req, { ok: true, question_id: data.id });
  }

  if (action === 'submit_bid') {
    const totalPrice = asNum(body.total_price);
    const currency = asText(body.currency_code, 3) || 'SAR';
    const leadTime = body.lead_time_days === undefined ? null : asNum(body.lead_time_days);
    const discount = body.discount_percent === undefined ? 0 : asNum(body.discount_percent);
    if (totalPrice <= 0) return json(req, { error: 'السعر يجب أن يكون أكبر من صفر' }, 400);

    const bidNumber = `BID-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;
    const { data: bid, error: bidError } = await admin.from('supplier_bids').upsert({
      tenant_id: inv.tenant_id,
      event_id: inv.event_id,
      supplier_id: inv.supplier_id,
      bid_number: bidNumber,
      total_price: totalPrice,
      currency_code: currency,
      lead_time_days: leadTime,
      discount_percent: discount,
      status: 'submitted',
    }, { onConflict: 'tenant_id,event_id,supplier_id' }).select('id').single();
    if (bidError) return json(req, { error: 'تعذر تقديم العرض' }, 500);

    await admin.from('rfx_supplier_invitations').update({ status: 'responded', bid_id: bid.id, responded_at: new Date().toISOString() }).eq('id', inv.id);
    await admin.from('rfx_event_audit_log').insert({ tenant_id: inv.tenant_id, event_id: inv.event_id, action: 'supplier_bid_submitted', entity_table: 'supplier_bids', entity_id: bid.id, new_value: { supplier_id: inv.supplier_id, total_price: totalPrice } }).catch(() => undefined);
    return json(req, { ok: true, bid_id: bid.id, message: 'تم تقديم العرض بنجاح' });
  }

  return json(req, { error: 'إجراء غير مدعوم' }, 400);
});
