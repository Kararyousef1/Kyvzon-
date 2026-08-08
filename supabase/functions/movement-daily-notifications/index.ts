/**
 * movement-daily-notifications
 * مُشغِّل الإشعارات المجدولة لبوابة الحركة واللوجستيات — كل المستأجرين.
 *
 * ما يعالجه:
 *   البوابة ترصد رخصاً ووثائق تنتهي وتصاريح متأخرة ورحلات متعثّرة،
 *   لكن **لا أحد يُبلَّغ** إن لم يفتح الصفحة. هذه الدالة تُشغّل
 *   run_movement_daily_notifications_cron() (0286) الذي يمرّ على كل
 *   المستأجرين المفعِّلين لوحدة movement.
 *
 * لماذا service_role لا JWT؟
 *   دوال cron لا تملك جلسة مستخدم، فلا تستطيع الاعتماد على
 *   current_user_tenant_id() — الدرس المستفاد من 0268.
 *
 * الأمان:
 *   - CRON_SECRET بمقارنة ثابتة الزمن (لا JWT، لا CORS — ليست واجهة متصفح).
 *   - service_role key من البيئة فقط.
 *
 * الجدولة (Supabase Dashboard → Edge Functions → Cron):
 *   الإشعارات:   0 6 * * *    POST /functions/v1/movement-daily-notifications
 *   التنظيف:     0 3 * * 0    POST … { "purge_telemetry": true }
 *   Header: x-cron-secret: <CRON_SECRET>
 *
 * ملاحظة على تأخر التصاريح: تشغيل يومي واحد قد لا يكفي لرصد التأخر
 * بسرعة. يُنصح بجدولة إضافية كل 30 دقيقة بـ { "only": "permits" }.
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

  let graceMinutes = 15;
  let purgeTelemetry = false;
  let purgeDays = 90;

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      graceMinutes = clampInt(body?.grace_minutes, 15, 0, 240);
      purgeTelemetry = body?.purge_telemetry === true;
      purgeDays = clampInt(body?.purge_days, 90, 7, 730);
    } catch {
      // جسم فارغ أو غير JSON → القيم الافتراضية (شائع في استدعاء cron)
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { data, error } = await admin.rpc('run_movement_daily_notifications_cron', {
      p_grace_minutes: graceMinutes,
    });
    if (error) throw error;

    const rows = (data ?? []) as DispatchRow[];
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

    // تنظيف بيانات التتبع — أسبوعياً لا يومياً (الجدول ينمو بالملايين)
    let purgedRows: number | null = null;
    if (purgeTelemetry) {
      const { data: purged, error: purgeError } = await admin.rpc('purge_old_telemetry', {
        p_days: purgeDays,
      });
      if (purgeError) {
        failures.push({ tenant_id: '-', job: 'purge_telemetry', error: purgeError.message });
      } else {
        purgedRows = Number(purged ?? 0);
      }
    }

    await admin
      .from('platform_audit_log')
      .insert({
        action: 'movement_daily_notifications_cron',
        category: 'movement',
        target_type: 'system',
        details: {
          tenants_processed: tenants.size,
          total_notifications: totalNotifications,
          summary,
          failures: failures.slice(0, 20),
          purged_telemetry_rows: purgedRows,
          params: { grace_minutes: graceMinutes },
        },
        description:
          `إشعارات الحركة اليومية: ${tenants.size} مستأجر، ` +
          `${totalNotifications} إشعار، ${failures.length} فشل`,
      })
      .then(undefined, () => undefined);

    return jsonResponse({
      ok: true,
      tenants_processed: tenants.size,
      total_notifications: totalNotifications,
      summary,
      failures,
      purged_telemetry_rows: purgedRows,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('movement daily notifications cron failed:', message);
    // لا نُسرِّب تفاصيل داخلية للمتصل
    return jsonResponse({ error: 'Cron failed' }, 500);
  }
});
