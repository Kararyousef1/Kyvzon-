/**
 * عقد ترحيل النظام القديم — 0292 (الترحيل) · 0293 (المزامنة الحيّة)
 *
 * التحقق السلوكي في tools/dev/verify-movement-0292-migration.sql
 * (40/40 على Postgres 17 محلي، على قاعدة مبنيّة من الصفر).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const M0292 = read('supabase/migrations/0292_movement_legacy_data_migration.sql');
const M0293 = read('supabase/migrations/0293_movement_legacy_sync_triggers.sql');
const SDK = read('src/services/sdk/MovementTelemetryService.ts');
const FOUNDATION = read('src/pages/app/movement/logistics/LogisticsFoundationPage.tsx');

describe('0292 — الترحيل: السلامة قبل السرعة', () => {
  it('لا يحذف ولا يُسقط أي جدول قديم', () => {
    expect(M0292).not.toMatch(/DROP TABLE/i);
    expect(M0292).not.toMatch(/TRUNCATE/i);
    expect(M0292).not.toMatch(/DELETE FROM public\.(movements_log|movement_permits)/i);
  });

  it('حارسه يمنع إسقاط الجداول القديمة في هذه المرحلة', () => {
    expect(M0292).toContain('legacy tables must NOT be dropped at this stage');
  });

  it('يشرح لماذا لا إعادة تسمية إلى _deprecated الآن', () => {
    expect(M0292).toContain('الكود ما زال يقرأ القديم');
  });

  it('يربط كل صف بأصله عبر عمود تتبّع', () => {
    expect(M0292).toContain('legacy_permit_id');
    expect(M0292).toContain('legacy_movement_id');
  });

  it('فهرس فريد يمنع الازدواج ويجعل إعادة التشغيل آمنة', () => {
    expect(M0292).toContain('uq_emp_permits_legacy_id');
    expect(M0292).toContain('uq_emp_movements_legacy_id');
  });

  it('🔴 يتحقق من مطابقة العدد ويفشل عند أي فقد', () => {
    expect(M0292).toContain('permits count mismatch');
    expect(M0292).toContain('movements count mismatch');
  });

  it('يفشل عند ازدواج معرّف قديم', () => {
    expect(M0292).toContain('duplicated legacy permit ids');
    expect(M0292).toContain('duplicated legacy movement ids');
  });

  it('يفشل عند تجاوز حدود المستأجر', () => {
    expect(M0292).toContain('crossed tenant boundary');
  });

  it('كل الإدراجات NOT EXISTS — لا تكرار عند إعادة التشغيل', () => {
    const inserts = M0292.match(/INSERT INTO public\.employee_movement/g) ?? [];
    const guards = M0292.match(/WHERE NOT EXISTS/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(inserts.length);
  });
});

describe('0292 — تحويلات الحقول الإلزامية', () => {
  it('purpose الفارغ يحصل على نص بديل — العمود NOT NULL', () => {
    expect(M0292).toContain('الغرض غير مسجَّل');
  });

  it('الوجهة الفارغة تحصل على اسم بديل', () => {
    expect(M0292).toContain("'وجهة غير محددة'");
  });

  it('expected_return_at يُشتق بسلّم مرتَّب لا NULL', () => {
    expect(M0292).toMatch(
      /COALESCE\(m\.expected_return_at,\s*m\.returned_at,\s*m\.departure_at \+ interval '30 minutes'\)/,
    );
  });

  it('الحالة تُشتق من الواقع: violated قبل returned', () => {
    const idx = M0292.indexOf("THEN 'violated'");
    const idx2 = M0292.indexOf("THEN 'returned'");
    expect(idx).toBeGreaterThan(-1);
    expect(idx).toBeLessThan(idx2);
  });

  it('return_notes و movement_type لا تُفقدان — تُضمّان للملاحظات', () => {
    expect(M0292).toContain('ملاحظة العودة:');
    expect(M0292).toContain('نوع الحركة (قديم):');
  });

  it('الطوابع الزمنية الأصلية محفوظة — لا now()', () => {
    // الصف الجديد يرث created_at/updated_at من الأصل لا من لحظة الترحيل
    expect(M0292).toMatch(/m\.created_at,\s*m\.updated_at,\s*m\.id/);
    expect(M0292).toMatch(/p\.created_at,\s*p\.updated_at,\s*p\.id/);
  });
});

describe('0292 — المواقع من الوجهات النصية', () => {
  it('يُطبّع المسافات قبل المطابقة', () => {
    expect(M0292).toContain('regexp_replace(trim(destination)');
    expect(M0292).toMatch(/regexp_replace\(trim\(destination\), '.s\+', ' ', 'g'\)/);
  });

  it('يطابق بلا حساسية لحالة الأحرف', () => {
    expect(M0292).toContain('lower(l.name_ar) = lower(');
  });

  it('client_site — الوجهات القديمة أماكن خارجية', () => {
    expect(M0292).toContain("'client_site'");
  });

  it('بلا إحداثيات مخمَّنة', () => {
    expect(M0292).toContain('بلا إحداثيات');
    // لا عمود إحداثيات في إدراج المواقع المُرحَّلة
    const ins = M0292.slice(M0292.indexOf('INSERT INTO public.movement_locations'));
    expect(ins.slice(0, 300)).not.toContain('latitude');
  });

  it('المواقع المُنشأة موسومة بـ LEG-', () => {
    expect(M0292).toContain("'LEG-'");
  });
});

describe('0292 — منطق واحد لا مكرَّر', () => {
  it('الدالة هي المصدر الوحيد والمايجريشن يستدعيها', () => {
    expect(M0292).toContain('migrate_pending_legacy_movements');
    expect(M0292).toContain('المصدر الوحيد للمنطق');
    expect(M0292).toContain('SELECT * INTO v_r FROM public.migrate_pending_legacy_movements()');
  });

  it('يوثّق العيب الذي كشفه الاختبار السلوكي', () => {
    expect(M0292).toContain('كشفه الاختبار');
    expect(M0292).toContain('دون إنشاء المواقع');
  });

  it('الدالة تُنشئ المواقع أيضاً لا الصفوف فقط', () => {
    expect(M0292).toContain('locations_created');
  });

  it('دالة الالتقاط لـ service_role فقط', () => {
    expect(M0292).toContain('FROM PUBLIC, anon, authenticated');
    expect(M0292).toContain('catch-up function must be service_role only');
  });

  it('عرض الحالة يكشف أي فجوة متبقّية', () => {
    expect(M0292).toContain('movement_legacy_migration_status');
    expect(M0292).toContain('pending_rows');
  });
});

describe('0293 — المزامنة الحيّة تُنهي الانقسام', () => {
  it('محفّزان على الجدولين القديمين', () => {
    expect(M0293).toContain('trg_sync_legacy_movement_permit');
    expect(M0293).toContain('trg_sync_legacy_movement_log');
    expect(M0293).toContain('ON public.movement_permits');
    expect(M0293).toContain('ON public.movements_log');
  });

  it('يلتقط INSERT و UPDATE معاً على الجدولين', () => {
    // مرة في تعريف كل محفّز (والثالثة في تعليق يشرح السبب)
    expect(M0293).toMatch(/AFTER INSERT OR UPDATE ON public\.movement_permits/);
    expect(M0293).toMatch(/AFTER INSERT OR UPDATE ON public\.movements_log/);
  });

  it('يشرح لماذا UPDATE ضروري لا الإدراج وحده', () => {
    expect(M0293).toContain('لتجمّد الصف الجديد على الحالة الأولى');
  });

  it('اتجاه واحد فقط — لا حلقة لا نهائية', () => {
    expect(M0293).toContain('قديم ← جديد فقط');
    expect(M0293).toContain('حلقة لا نهائية');
  });

  it('يوثّق البدائل المرفوضة وسببها', () => {
    expect(M0293).toContain('إعادة كتابة الصفحات الأربع');
    expect(M0293).toContain('2,264 سطراً');
    expect(M0293).toContain('INSTEAD OF');
  });

  it('ON CONFLICT يذكر شرط الفهرس الجزئي', () => {
    // بدونه: there is no unique or exclusion constraint matching...
    expect(M0293).toContain('ON CONFLICT (legacy_permit_id) WHERE legacy_permit_id IS NOT NULL');
    expect(M0293).toContain('ON CONFLICT (legacy_movement_id) WHERE legacy_movement_id IS NOT NULL');
    expect(M0293).toContain('لا\n  -- يطابق فهرساً جزئياً');
  });

  it('DO UPDATE لا DO NOTHING — التعديلات تنعكس', () => {
    expect((M0293.match(/DO UPDATE SET/g) ?? []).length).toBe(2);
  });

  it('اشتقاق الحالة مطابق لـ 0292 — لا تباعد', () => {
    for (const st of ['violated', 'returned', 'overdue', 'out']) {
      expect(M0292).toContain(`'${st}'`);
      expect(M0293).toContain(`'${st}'`);
    }
  });

  it('يعالج سباق إنشاء الموقع نفسه', () => {
    expect(M0293).toContain('سباق نادر');
    expect(M0293).toContain('ON CONFLICT (tenant_id, code) DO NOTHING');
  });

  it('دوال المحفّزات محجوبة عن anon و authenticated', () => {
    expect(M0293).toContain('FROM PUBLIC, anon, authenticated');
  });

  it('🔴 حارسه يختبر المزامنة حيّاً ثم يتراجع', () => {
    expect(M0293).toContain('PROBE_ROLLBACK_0293');
    expect(M0293).toContain('INSERT not synced');
    expect(M0293).toContain('UPDATE not synced');
    expect(M0293).toContain('UPDATE created a duplicate row');
  });
});

describe('مراقبة الترحيل في الواجهة', () => {
  it('SDK يقرأ عرض الحالة', () => {
    expect(SDK).toContain('findLegacyMigrationStatus');
    expect(SDK).toContain("from('movement_legacy_migration_status')");
    expect(SDK).toContain('export interface LegacyMigrationStatus');
  });

  it('صفحة الأساس تعرضها وتوضح أن الصفر هو المطلوب', () => {
    expect(FOUNDATION).toContain('findLegacyMigrationStatus');
    expect(FOUNDATION).toContain('ترحيل بيانات النظام القديم');
    expect(FOUNDATION).toContain('يجب أن يبقى صفراً');
  });

  it('تُميّز بصرياً بين لا-انقسام والمتبقّي', () => {
    expect(FOUNDATION).toContain('لا انقسام');
    expect(FOUNDATION).toContain('متبقٍّ');
  });

  it('فشل القراءة لا يُسقط الصفحة', () => {
    expect(FOUNDATION).toContain('findLegacyMigrationStatus().catch(() => [])');
  });
});
