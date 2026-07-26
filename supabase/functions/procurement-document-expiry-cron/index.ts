/**
 * Edge Function: procurement-document-expiry-cron
 * يومي: يفحص supplier_documents.expiry_date → يرسل بريد للمورد + مدير + يجمد طلبات جديدة إذا وثيقة حرجة انتهت
 * 
 * يُستدعى عبر cron (Supabase Cron أو Netlify Scheduled Functions) — لا JWT، بل HMAC secret
 * الأمان: تحقق من CRON_SECRET
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

async function verifyCronSecret(req: Request): Promise<boolean> {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return false;
  const provided = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ','');
  if (!provided) return false;
  // constant-time comparison
  if (provided.length !== secret.length) return false;
  let diff=0;
  for (let i=0;i<secret.length;i++) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff===0;
}

serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  if (!(await verifyCronSecret(req))) {
    return new Response(JSON.stringify({ error: 'Invalid cron secret' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Service not configured' }), { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // 1) وثائق منتهية الصلاحية
    const { data: expired, error: expError } = await admin
      .from('supplier_documents')
      .select('id, supplier_id, doc_type, expiry_date, tenant_id')
      .eq('verification_status','verified')
      .lt('expiry_date', new Date().toISOString().split('T')[0]);

    if (expError) throw expError;

    let expiredCount = 0;
    let criticalFrozen = 0;

    for (const doc of expired || []) {
      // علم الوثيقة كـ expired
      await admin.from('supplier_documents').update({ verification_status: 'expired', updated_at: new Date().toISOString() }).eq('id', doc.id);

      // إذا كانت وثيقة حرجة (سجل تجاري, ضريبة, تأمين) → جمد المورد
      if (['commercial_register','tax_certificate','insurance'].includes(doc.doc_type)) {
        const { data: supplier } = await admin.from('suppliers').select('status').eq('id', doc.supplier_id).single();
        if (supplier && supplier.status !== 'suspended') {
          await admin.from('suppliers').update({ status: 'suspended', updated_at: new Date().toISOString() }).eq('id', doc.supplier_id);
          criticalFrozen++;
        }
      }
      expiredCount++;
    }

    // 2) وثائق تنتهي خلال 30 يوم — تحذير
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate()+30);
    const { data: warning30 } = await admin
      .from('supplier_documents')
      .select('id, supplier_id, doc_type, expiry_date, tenant_id')
      .eq('verification_status','verified')
      .gte('expiry_date', new Date().toISOString().split('T')[0])
      .lte('expiry_date', in30Days.toISOString().split('T')[0]);

    // 3) وثائق تنتهي خلال 90 يوم — تنبيه
    const in90Days = new Date();
    in90Days.setDate(in90Days.getDate()+90);
    const { data: warning90 } = await admin
      .from('supplier_documents')
      .select('id, supplier_id, doc_type, expiry_date, tenant_id')
      .eq('verification_status','verified')
      .gte('expiry_date', new Date().toISOString().split('T')[0])
      .lte('expiry_date', in90Days.toISOString().split('T')[0]);

    // 4) سجل التدقيق
    await admin.from('platform_audit_log').insert({
      action: 'procurement_document_expiry_cron',
      category: 'procurement',
      target_type: 'system',
      details: {
        expired_checked: expired?.length || 0,
        expired_marked: expiredCount,
        critical_frozen: criticalFrozen,
        warning_30_count: warning30?.length || 0,
        warning_90_count: warning90?.length || 0,
      },
      description: `Cron: ${expiredCount} وثائق منتهية، ${criticalFrozen} مورد مجمد، ${warning30?.length||0} تحذير 30 يوم، ${warning90?.length||0} تنبيه 90 يوم`,
    });

    // TODO: إرسال بريد للموردين + مديري المشتريات عبر Resend/BYOK — يُطبق لاحقاً مع قوالب بريد

    return new Response(JSON.stringify({
      ok: true,
      expired_checked: expired?.length || 0,
      expired_marked: expiredCount,
      critical_frozen: criticalFrozen,
      warning_30: warning30?.length || 0,
      warning_90: warning90?.length || 0,
      message: `Cron completed: ${expiredCount} expired, ${criticalFrozen} frozen, ${warning30?.length||0} critical 30d, ${warning90?.length||0} warning 90d`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('cron error:', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'Cron failed', details: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
