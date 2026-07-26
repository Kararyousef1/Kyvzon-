/**
 * procurement-supplier-portal
 * بوابة الموردين الذاتية — Unit 03 Supplier Onboarding
 *
 * Public capability-token function (no JWT):
 *  - verify: يتحقق من token ويعيد بيانات المورد الأساسية
 *  - submit: يستقبل بيانات التسجيل/التحديث والوثائق وجهات الاتصال، ثم يرسل المورد للمراجعة
 *
 * الأمان:
 *  - token خام لا يُخزّن؛ نستخدم SHA-256 ونقارن token_hash
 *  - لا نقبل tenant_id من العميل؛ tenant_id يأتي من invite فقط
 *  - كل عمليات update/insert مقيدة بـ supplier_id + tenant_id من الدعوة
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

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function asText(value: unknown, max = 500): string | null {
  if (value === undefined || value === null) return null;
  const out = String(value).trim();
  if (!out) return null;
  return out.slice(0, max);
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 100);
  return String(value).split(',').map((v) => v.trim()).filter(Boolean).slice(0, 100);
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.includes(',') ? value.split(',').pop() || '' : value;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function ensureBucket(admin: any, bucket: string): Promise<void> {
  try {
    const { data } = await admin.storage.listBuckets();
    if (!Array.isArray(data) || !data.some((b: any) => b.name === bucket)) {
      await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: 10 * 1024 * 1024 });
    }
  } catch (e) {
    console.warn('ensure bucket failed:', e instanceof Error ? e.message : String(e));
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const requestOrigin = req.headers.get('origin');
  if (requestOrigin && resolveAllowedOrigin(req) === '') return json(req, { error: 'Origin not allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(req, { error: 'Service not configured' }, 503);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(req, { error: 'حمولة غير صالحة' }, 400); }

  const action = String(body.action || 'verify');
  const token = String(body.token || '').trim();
  if (!token || token.length < 32 || token.length > 200) return json(req, { error: 'رابط الدعوة غير صالح' }, 400);

  const tokenHash = await sha256Hex(token);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: invite, error: inviteError } = await admin
    .from('supplier_portal_invites')
    .select('id, tenant_id, supplier_id, email, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (inviteError) return json(req, { error: 'تعذر التحقق من الدعوة' }, 500);
  if (!invite) return json(req, { error: 'الدعوة غير موجودة أو غير صالحة' }, 404);
  if (invite.used_at) return json(req, { error: 'تم استخدام هذه الدعوة مسبقاً' }, 410);
  if (new Date(invite.expires_at).getTime() < Date.now()) return json(req, { error: 'انتهت صلاحية الدعوة' }, 410);
  if (!invite.supplier_id || !invite.tenant_id) return json(req, { error: 'الدعوة غير مرتبطة بمورد' }, 400);

  const supplierSelect = 'id, supplier_code, legal_name, trade_name, email, phone, tax_number, registration_number, legal_form, country, operating_country, city, address, website, industry, employee_count, annual_revenue, bank_name, iban, swift_code, currency_code, payment_terms_days, credit_limit, product_list, max_capacity, reference_customers, lead_time_days, status, supplier_type, risk_level, risk_score, bcp_summary, sanctions_checked, conflict_checked';

  if (action === 'verify') {
    const { data: supplier } = await admin
      .from('suppliers')
      .select(supplierSelect)
      .eq('id', invite.supplier_id)
      .eq('tenant_id', invite.tenant_id)
      .single();

    const { data: documents } = await admin
      .from('supplier_documents')
      .select('id, doc_type, file_name, file_url, expiry_date, verification_status')
      .eq('supplier_id', invite.supplier_id)
      .eq('tenant_id', invite.tenant_id)
      .order('created_at', { ascending: false });

    const { data: contacts } = await admin
      .from('supplier_contacts')
      .select('id, full_name, job_title, email, phone, is_primary')
      .eq('supplier_id', invite.supplier_id)
      .eq('tenant_id', invite.tenant_id)
      .order('is_primary', { ascending: false });

    return json(req, { ok: true, invite_email: invite.email, supplier, documents: documents || [], contacts: contacts || [] });
  }

  if (action !== 'submit') return json(req, { error: 'إجراء غير مدعوم' }, 400);

  const supplierInput = (body.supplier || {}) as Record<string, unknown>;
  const legalName = asText(supplierInput.legal_name, 250);
  if (!legalName || legalName.length < 2) return json(req, { error: 'الاسم القانوني مطلوب' }, 400);

  const updatePayload: Record<string, unknown> = {
    legal_name: legalName,
    trade_name: asText(supplierInput.trade_name, 250),
    email: asText(supplierInput.email, 254) || invite.email,
    phone: asText(supplierInput.phone, 80),
    tax_number: asText(supplierInput.tax_number, 100),
    registration_number: asText(supplierInput.registration_number, 100),
    legal_form: asText(supplierInput.legal_form, 40),
    country: asText(supplierInput.country, 80),
    operating_country: asText(supplierInput.operating_country, 80),
    city: asText(supplierInput.city, 120),
    address: asText(supplierInput.address, 1000),
    website: asText(supplierInput.website, 250),
    industry: asText(supplierInput.industry, 150),
    employee_count: asNumber(supplierInput.employee_count),
    annual_revenue: asNumber(supplierInput.annual_revenue),
    bank_name: asText(supplierInput.bank_name, 150),
    iban: asText(supplierInput.iban, 80),
    swift_code: asText(supplierInput.swift_code, 40),
    currency_code: asText(supplierInput.currency_code, 3) || 'SAR',
    payment_terms_days: asNumber(supplierInput.payment_terms_days) ?? 45,
    credit_limit: asNumber(supplierInput.credit_limit),
    product_list: asStringArray(supplierInput.product_list),
    max_capacity: asNumber(supplierInput.max_capacity),
    reference_customers: asStringArray(supplierInput.reference_customers),
    lead_time_days: asNumber(supplierInput.lead_time_days),
    bcp_summary: asText(supplierInput.bcp_summary, 2000),
    sanctions_checked: Boolean(supplierInput.sanctions_checked),
    conflict_checked: Boolean(supplierInput.conflict_checked),
    status: 'under_review',
    updated_at: new Date().toISOString(),
  };

  Object.keys(updatePayload).forEach((k) => updatePayload[k] === null && delete updatePayload[k]);

  const { data: supplier, error: updateError } = await admin
    .from('suppliers')
    .update(updatePayload)
    .eq('id', invite.supplier_id)
    .eq('tenant_id', invite.tenant_id)
    .select(supplierSelect)
    .single();

  if (updateError) {
    console.error('supplier portal update error', updateError.message);
    return json(req, { error: 'تعذر حفظ بيانات المورد' }, 500);
  }

  const documents = Array.isArray(body.documents) ? body.documents.slice(0, 20) as Record<string, unknown>[] : [];
  let uploadedCount = 0;
  if (documents.length) {
    const bucket = 'supplier-documents';
    await ensureBucket(admin, bucket);
    const rows: Record<string, unknown>[] = [];

    for (const d of documents) {
      const fileName = asText(d.file_name, 250) || 'document';
      let fileUrl = asText(d.file_url, 1000) || '';
      const fileBase64 = asText(d.file_base64, 15 * 1024 * 1024);
      const fileMime = asText(d.file_mime, 120) || 'application/octet-stream';

      if (fileBase64) {
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
        const path = `${invite.tenant_id}/${invite.supplier_id}/${crypto.randomUUID()}-${safeName}`;
        const bytes = base64ToBytes(fileBase64);
        const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, {
          contentType: fileMime,
          upsert: false,
        });
        if (uploadError) {
          console.error('supplier document upload failed', uploadError.message);
          return json(req, { error: `تعذر رفع الوثيقة: ${fileName}` }, 500);
        }
        fileUrl = `storage://${bucket}/${path}`;
        uploadedCount++;
      }

      if (fileUrl) {
        rows.push({
          tenant_id: invite.tenant_id,
          supplier_id: invite.supplier_id,
          doc_type: asText(d.doc_type, 60) || 'other',
          file_name: fileName,
          file_url: fileUrl,
          expiry_date: asText(d.expiry_date, 20),
          verification_status: 'pending',
        });
      }
    }

    if (rows.length) await admin.from('supplier_documents').insert(rows);
  }

  const contacts = Array.isArray(body.contacts) ? body.contacts.slice(0, 20) as Record<string, unknown>[] : [];
  if (contacts.length) {
    const rows = contacts
      .map((c) => ({
        tenant_id: invite.tenant_id,
        supplier_id: invite.supplier_id,
        full_name: asText(c.full_name, 250) || '',
        job_title: asText(c.job_title, 150),
        email: asText(c.email, 254),
        phone: asText(c.phone, 80),
        is_primary: Boolean(c.is_primary),
      }))
      .filter((c) => c.full_name);
    if (rows.length) await admin.from('supplier_contacts').insert(rows);
  }

  if (body.answers && typeof body.answers === 'object') {
    await admin.from('supplier_qualification_responses').insert({
      tenant_id: invite.tenant_id,
      supplier_id: invite.supplier_id,
      answers: body.answers,
      completion_percent: 100,
      submitted_by_email: invite.email,
      submitted_at: new Date().toISOString(),
    });
  }

  await admin.from('supplier_audit_log').insert({
    tenant_id: invite.tenant_id,
    supplier_id: invite.supplier_id,
    action: 'supplier_portal_submitted',
    entity_table: 'suppliers',
    entity_id: invite.supplier_id,
    new_value: { supplier, documents_count: documents.length, uploaded_count: uploadedCount, contacts_count: contacts.length },
    comments: 'Submitted via supplier self-service portal',
  });

  await admin.from('supplier_portal_invites').update({ used_at: new Date().toISOString() }).eq('id', invite.id);

  return json(req, { ok: true, supplier, message: 'تم إرسال بياناتك للمراجعة. ستتواصل معك إدارة المشتريات بعد التحقق.' });
});
