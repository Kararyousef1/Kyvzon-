/**
 * procurement-daily-notifications
 * مُشغِّل الإشعارات المجدولة اليومية لبوابة المشتريات — كل المستأجرين.
 *
 * ما يعالجه:
 *   دوال 0266 (dispatch_*) كانت قابلة للاستدعاء يدوياً فقط من موظف
 *   مسجَّل الدخول، لأنها تعتمد current_user_tenant_id() و auth.uid().
 *   تحت cron (service_role، بلا جلسة) كانت تفشل بـ NO_AUTH / permission denied.
 *   المايجريشن 0268 أضاف نسخ *_for_tenant + المُشغِّل متعدد المستأجرين
 *   run_procurement_daily_notifications_cron() الممنوح لـ service_role فقط.
 *
 * الأمان:
 *   - CRON_SECRET بمقارنة ثابتة الزمن (لا JWT، لا CORS — ليست واجهة متصفح).
 *   - service_role key من البيئة فقط.
 *
 * الجدولة (Supabase Dashboard → Edge Functions → Cron، أو pg_cron + pg_net):
 *   0 6 * * *   POST /functions/v1/procurement-daily-notifications
 *   Header: x-cron-secret: <CRON_SECRET>
 *
 * المعاملات الاختيارية في الجسم:
 *   { "pr_hours": 48, "doc_days": 30 }
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** مقارنة ثابتة الزمن — تمنع timing attacks على السر */
async function verifyCronSecret(req: Request): Promise<boolean> {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return false;
  const provided =
    req.headers.get('x-cron-secret') ||
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    '';
  if (provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

type DispatchRow = {
  tenant_id: string;
  job: string;
  entities: number;
  notifications: number;
  error_message: string | null;
};

serve(async (req: Request) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!(await verifyCronSecret(req))) {
    return jsonResponse({ error: 'Invalid cron secret' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'Service not configured' }, 503);
  }

  let prHours = 48;
  let docDays = 30;
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      prHours = clampInt(body?.pr_hours, 48, 1, 720);
      docDays = clampInt(body?.doc_days, 30, 0, 365);
    } catch {
      // جسم فارغ أو غير JSON → القيم الافتراضية (استدعاء cron بلا جسم أمر شائع)
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { data, error } = await admin.rpc('run_procurement_daily_notifications_cron', {
      p_pr_hours: prHours,
      p_doc_days: docDays,
    });
    if (error) throw error;

    const rows = (data ?? []) as DispatchRow[];

    // تجميع النتائج حسب المهمة
    const summary: Record<string, { entities: number; notifications: number; errors: number }> = {};
    const tenants = new Set<string>();
    const failures: Array<{ tenant_id: string; job: string; error: string }> = [];

    for (const row of rows) {
      tenants.add(row.tenant_id);
      const bucket = (summary[row.job] ??= { entities: 0, notifications: 0, errors: 0 });
      bucket.entities += Number(row.entities || 0);
      bucket.notifications += Number(row.notifications || 0);
      if (row.error_message) {
        bucket.errors += 1;
        failures.push({ tenant_id: row.tenant_id, job: row.job, error: row.error_message });
      }
    }

    const totalNotifications = Object.values(summary).reduce((s, b) => s + b.notifications, 0);

    await admin
      .from('platform_audit_log')
      .insert({
        action: 'procurement_daily_notifications_cron',
        category: 'procurement',
        target_type: 'system',
        details: {
          tenants_processed: tenants.size,
          total_notifications: totalNotifications,
          summary,
          failures: failures.slice(0, 20),
          params: { pr_hours: prHours, doc_days: docDays },
        },
        description:
          `إشعارات المشتريات اليومية: ${tenants.size} مستأجر، ` +
          `${totalNotifications} إشعار، ${failures.length} فشل`,
      })
      .then(undefined, () => undefined);

    return jsonResponse({
      ok: true,
      tenants_processed: tenants.size,
      total_notifications: totalNotifications,
      summary,
      failures,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('procurement daily notifications cron failed:', message);
    // لا نُسرِّب تفاصيل داخلية للمتصل
    return jsonResponse({ error: 'Cron failed' }, 500);
  }
});
