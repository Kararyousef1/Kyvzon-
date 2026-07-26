/**
 * procurement-contract-reminder — تذكير التزامات العقود + تجديدات قادمة
 * يومي cron: يفحص contract_obligations due_date + procurement_contracts end_date
 * يرسل بريد للمسؤول + مدير مشتريات + يسجل audit
 * الأمان: CRON_SECRET
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

async function verifyCronSecret(req: Request): Promise<boolean> {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return false;
  const provided = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ','');
  if (!provided) return false;
  if (provided.length !== secret.length) return false;
  let diff=0;
  for (let i=0;i<secret.length;i++) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff===0;
}

serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  if (!(await verifyCronSecret(req))) {
    return new Response(JSON.stringify({ error: 'Invalid cron secret' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return new Response(JSON.stringify({ error: 'Service not configured' }), { status: 503 });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // 1) التزامات مستحقة خلال 7/30 يوم + متأخرة
    const in7 = new Date(); in7.setDate(in7.getDate()+7);
    const in30 = new Date(); in30.setDate(in30.getDate()+30);

    const { data: overdue } = await admin.from('contract_obligations').select('id, contract_id, description, due_date, status, responsible_party, tenant_id').in('status',['pending','in_progress']).lt('due_date', new Date().toISOString().split('T')[0]);
    const { data: due7 } = await admin.from('contract_obligations').select('id, contract_id, description, due_date, status, tenant_id').in('status',['pending','in_progress']).gte('due_date', new Date().toISOString().split('T')[0]).lte('due_date', in7.toISOString().split('T')[0]);
    const { data: due30 } = await admin.from('contract_obligations').select('id, contract_id, description, due_date, status, tenant_id').in('status',['pending','in_progress']).gte('due_date', new Date().toISOString().split('T')[0]).lte('due_date', in30.toISOString().split('T')[0]);

    // 2) عقود تنتهي خلال 90 يوم
    const in90 = new Date(); in90.setDate(in90.getDate()+90);
    const { data: renewals } = await admin.from('procurement_contracts').select('id, contract_number, title, end_date, total_value, supplier_id, tenant_id').in('status',['active','signed']).gte('end_date', new Date().toISOString().split('T')[0]).lte('end_date', in90.toISOString().split('T')[0]);

    // 3) سجل تدقيق
    await admin.from('platform_audit_log').insert({
      action: 'procurement_contract_reminder_cron',
      category: 'procurement',
      target_type: 'system',
      details: {
        overdue_count: overdue?.length || 0,
        due_7_count: due7?.length || 0,
        due_30_count: due30?.length || 0,
        renewals_90_count: renewals?.length || 0,
      },
      description: `Cron: ${overdue?.length||0} التزامات متأخرة, ${due7?.length||0} خلال 7 أيام, ${due30?.length||0} خلال 30 يوم, ${renewals?.length||0} عقود تنتهي 90 يوم`,
    });

    // TODO: إرسال بريد للمسؤولين + مديري المشتريات + الموردين (عبر Resend/BYOK) — يُطبق مع قوالب

    return new Response(JSON.stringify({
      ok: true,
      overdue: overdue?.length || 0,
      due_7: due7?.length || 0,
      due_30: due30?.length || 0,
      renewals_90: renewals?.length || 0,
      message: `Cron completed: ${overdue?.length||0} overdue, ${due7?.length||0} due 7d, ${due30?.length||0} due 30d, ${renewals?.length||0} renewals 90d`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('contract reminder cron error', err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: 'Cron failed' }), { status: 500 });
  }
});
