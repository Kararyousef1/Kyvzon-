/**
 * عقد 0298 — العمل دون اتصال لكل عمليات السائق
 *
 * التحقق السلوكي في tools/dev/verify-movement-0298.sql
 * (26/26 على Postgres 17 من الصفر).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const M = read('supabase/migrations/0298_movement_driver_offline_sync.sql');
const SDK = read('src/services/sdk/DriverAppService.ts');
const INSP = read('src/pages/app/movement/driver/DriverInspectionPage.tsx');

describe('0298 — الفجوة التي يسدّها', () => {
  it('يوثّق أن ثلاث عمليات من أربع كانت تتطلب شبكة', () => {
    expect(M).toContain('record_my_vehicle_inspection');
    expect(M).toContain('يتطلب شبكة');
  });

  it('يشرح السيناريو: المرآب وساحة التحميل', () => {
    expect(M).toContain('مرآب');
    expect(M).toContain('فجوة\n--   امتثال');
  });
});

describe('0298 — الفحص idempotent', () => {
  it('client_uuid + فهرس فريد جزئي', () => {
    expect(M).toContain('ADD COLUMN IF NOT EXISTS client_uuid UUID');
    expect(M).toContain('uq_vehicle_inspections_client_uuid');
    expect(M).toContain('WHERE client_uuid IS NOT NULL');
  });

  it('الصدى يُرجع النتيجة الأصلية', () => {
    expect(M).toContain('الصدى: عملية سبق رفعها');
  });

  it('يعالج السباق عبر unique_violation', () => {
    expect(M).toContain('WHEN unique_violation THEN');
  });

  it('🔴 يقبل وقت التنفيذ على الجهاز', () => {
    expect(M).toContain('p_performed_at');
    expect(M).toContain('inspected_at');
    expect(M).toContain('يُفسد التسلسل الزمني');
  });

  it('يحرس ضد الزمن المزوَّر', () => {
    expect(M).toContain('PERFORMED_AT_IN_FUTURE');
    expect(M).toContain('PERFORMED_AT_TOO_OLD');
  });

  it('DROP قبل CREATE — درس 0294', () => {
    expect(M).toContain('DROP FUNCTION IF EXISTS public.record_my_vehicle_inspection(UUID,TEXT,JSONB,NUMERIC,TEXT,TEXT);');
    expect(M).toContain('overloads');
  });
});

describe('0298 — 🔴 الرفع الدفعي المرتَّب', () => {
  it('الترتيب زمني لا حسب المصفوفة', () => {
    expect(M).toContain("ORDER BY COALESCE((e->>'performed_at')");
    expect(M).toContain('الترتيب حرج');
  });

  it('حارسه يفرض وجود الترتيب في الكود', () => {
    expect(M).toContain('batch must be ordered by performed_at');
  });

  it('يشرح لماذا: الإكمال يتطلب ePOD', () => {
    expect(M).toContain("'completed' يتطلب ePOD");
  });

  it('يدعم الأنواع الثلاثة', () => {
    expect(M).toContain("WHEN 'inspection' THEN");
    expect(M).toContain("WHEN 'delivery_proof' THEN");
    expect(M).toContain("WHEN 'trip_status' THEN");
  });

  it('عملية فاشلة لا تُسقط الدفعة', () => {
    expect(M).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(M).toMatch(/v_st\s+:= 'failed'/);
  });

  it('العمليات غير القابلة للتسجيل تُعاد فاشلة بلا انهيار', () => {
    // كشفهما التشغيل: NOT NULL على client_uuid و CHECK على النوع
    expect(M).toContain('CLIENT_UUID_REQUIRED');
    expect(M).toContain('UNKNOWN_OPERATION_TYPE');
    expect(M).toContain('violates not-null');
    expect(M).toContain('violates check constraint');
  });

  it('حد حجم الدفعة', () => {
    expect(M).toContain('BATCH_TOO_LARGE (max 100)');
  });

  it('أسماء المخرجات مسبوقة بـ out_ لتجنّب الالتباس', () => {
    expect(M).toContain('out_client_uuid');
    expect(M).toContain('is ambiguous');
  });
});

describe('0298 — سجل العمليات', () => {
  it('جدول بـ RLS وسياسة', () => {
    expect(M).toContain('CREATE TABLE IF NOT EXISTS public.driver_offline_operations');
    expect(M).toContain('ENABLE ROW LEVEL SECURITY');
    expect(M).toContain('CREATE POLICY kyvzon_driver_offline_ops_all');
    expect(M).toContain('total lockout');
  });

  it('يميّز applied / duplicate / failed', () => {
    for (const s of ['applied', 'duplicate', 'failed']) {
      expect(M).toContain(`'${s}'`);
    }
  });

  it('عرض يُظهر الفشل للمُرسِل', () => {
    expect(M).toContain('driver_offline_sync_issues');
    expect(M).toContain('delay_hours');
    expect(M).toContain('ضاع العمل الميداني');
  });

  it('anon محروم', () => {
    expect(M).toContain('0298 failed: anon can execute');
    expect(M).toContain('anon can read offline operations');
  });
});

describe('SDK — طابور العمليات', () => {
  it('طابور منفصل عن طابور المواقع', () => {
    expect(SDK).toContain("OPS_KEY = 'kyvzon.driver.ops.v1'");
    expect(SDK).toContain('MAX_OPS = 100');
  });

  it('يمنع تكرار العملية في الطابور نفسه', () => {
    expect(SDK).toContain('list.some((o) => o.client_uuid === op.client_uuid)');
  });

  it('يرسل الطابور دفعةً — الخادم يرتّب', () => {
    expect(SDK).toContain("rpc('sync_driver_offline_batch'");
  });

  it('🔴 يُزيل الناجح والمكرَّر ويُبقي الفاشل مؤقتاً', () => {
    expect(SDK).toContain("r.out_status !== 'failed'");
    expect(SDK).toContain('done.has(o.client_uuid)');
  });

  it('🔴 يُزيل الفشل الدائم — وإلا لم يفرغ الطابور أبداً', () => {
    expect(SDK).toContain('permanent');
    expect(SDK).toContain('CLIENT_UUID_REQUIRED|UNKNOWN_OPERATION_TYPE');
    expect(SDK).toContain('طابوراً لا يفرغ أبداً');
  });

  it('يُصدّر أنواع الطابور', () => {
    expect(SDK).toContain('export interface QueuedOperation');
    expect(SDK).toContain('export interface SyncOpResult');
    expect(SDK).toContain('performed_at');
  });

  it('مولّد معرّفات مع بديل عن randomUUID', () => {
    expect(SDK).toContain('newOperationId');
    expect(SDK).toContain('Math.random()');
  });

  it('تخزين تالف لا يُعطّل التطبيق', () => {
    expect(SDK).toContain('Array.isArray(parsed) ? (parsed as QueuedOperation[]) : []');
  });

  it('الفحص يمرّر clientUuid و performedAt', () => {
    expect(SDK).toContain('p_client_uuid: input.clientUuid');
    expect(SDK).toContain('p_performed_at: input.performedAt');
  });

  it('بلا as any', () => {
    expect(SDK).not.toContain('as any');
    expect(INSP).not.toContain('as any');
  });
});

describe('شاشة الفحص — العمل دون اتصال', () => {
  it('تشرح لماذا المرآب يحتاج وضعاً دون اتصال', () => {
    expect(INSP).toContain('تغطيتها ضعيفة بطبيعتها');
    expect(INSP).toContain('بوقت تنفيذه الأصلي');
  });

  it('تحفظ محلياً عند انقطاع الشبكة', () => {
    expect(INSP).toContain('!navigator.onLine');
    expect(INSP).toContain('queueOperation');
  });

  it('🔴 تحفظ أيضاً عند فشل الشبكة رغم onLine', () => {
    expect(INSP).toContain('فشل الشبكة رغم onLine');
  });

  it('الرفع تلقائي عند عودة الشبكة', () => {
    expect(INSP).toContain("addEventListener('online'");
    expect(INSP).toContain('syncOperations');
  });

  it('تُنظّف المستمعين عند التفكيك', () => {
    expect(INSP).toContain("removeEventListener('online'");
    expect(INSP).toContain("removeEventListener('offline'");
  });

  it('تعرض عدد العمليات المؤجَّلة وزر رفع يدوي', () => {
    expect(INSP).toContain('pending');
    expect(INSP).toContain('رفع {pending} عملية');
  });

  it('تُفصح أن العيب الحرج حُفظ محلياً', () => {
    expect(INSP).toContain('حُفظ العيب الحرج محلياً');
  });

  it('لا تلمس supabase مباشرة', () => {
    expect(INSP).not.toMatch(/supabase\.(from|rpc)\(/);
  });

  it('بلا confirm/prompt في الكود', () => {
    const code = INSP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/(?:window\.)?\bconfirm\s*\(/);
    expect(code).not.toMatch(/(?:window\.)?\bprompt\s*\(/);
  });
});
