/**
 * movementRoleFromUnitsContract.test.ts — عقد مايجريشن 0311
 *
 * ═════════════════════════════════════════════════════════════════════════
 * القرار الموثَّق: (ج) جسر ثم هجرة.
 *   'movement_manager' يصير **دوراً مُشتقّاً لا مُسنَداً**: إسناد وحدة الحركة
 *   لمدير يفتح له البوابة القديمة، فلا يعود أحد مضطراً لكتابة الدور في
 *   profiles.role — وهو ما كان يُفقده دور 'manager' وبوابة المدير كاملةً.
 *
 * لا نستورد خدمات SDK هنا (تُهيّئ Supabase فتفشل بـ no tests) — نقرأ نصّاً.
 *
 * حدّ النطاق: نقتطع جسم كل دالة بين تعريفها و COMMENT ON FUNCTION الخاص بها
 * حتى لا يلتقط التأكيدُ نمطاً من دالة مجاورة (درس من جولة سابقة).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const MIG = readFileSync(
  resolve(root, 'supabase/migrations/0311_movement_role_from_portal_units.sql'),
  'utf-8',
);
const VERIFY = readFileSync(
  resolve(root, 'tools/dev/verify-movement-role-from-units-0311.sql'),
  'utf-8',
);
const M0300 = readFileSync(
  resolve(root, 'supabase/migrations/0300_movement_role_assignment_sync.sql'),
  'utf-8',
);

/** يقتطع نطاق دالة بعينها لتفادي التقاط نمط من دالة مجاورة */
function fnScope(sql: string, name: string): string {
  const start = sql.indexOf(`FUNCTION public.${name}`);
  if (start === -1) throw new Error(`الدالة ${name} غير موجودة`);
  const commentAt = sql.indexOf(`COMMENT ON FUNCTION public.${name}`, start);
  const end = commentAt === -1 ? sql.length : commentAt;
  return sql.slice(start, end);
}

/** يجرّد تعليقات SQL — ذكر نمط في توثيق «تجنّبناه» ليس استخداماً */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((l) => {
      const i = l.indexOf('--');
      return i === -1 ? l : l.slice(0, i);
    })
    .join('\n');
}

const MIG_CODE = stripComments(MIG);

describe('0311 — بنية المايجريشن', () => {
  it('يوسّع قيد origin ليقبل unit_sync', () => {
    expect(MIG_CODE).toContain("CHECK (origin IN ('manual', 'profile_sync', 'unit_sync'))");
  });

  it('يُسقط القيد القديم صراحةً قبل إعادة بنائه', () => {
    const dropAt = MIG_CODE.indexOf('DROP CONSTRAINT IF EXISTS movement_role_assignments_origin_check');
    const addAt = MIG_CODE.indexOf('ADD CONSTRAINT movement_role_assignments_origin_check');
    expect(dropAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(dropAt);
  });

  it('يُسقط الدالة صراحةً — CREATE OR REPLACE لا يغيّر نوع الإرجاع', () => {
    expect(MIG_CODE).toContain('DROP FUNCTION IF EXISTS public.movement_roles_for_portal_unit(TEXT, TEXT)');
  });

  it('دالة التحويل IMMUTABLE (صرفة وقابلة للاختبار بلا حالة)', () => {
    expect(fnScope(MIG_CODE, 'movement_roles_for_portal_unit')).toContain('IMMUTABLE');
  });

  it('كل الدوال تثبّت search_path (منع اختطاف المخطط)', () => {
    const defs = MIG_CODE.match(/(CREATE (OR REPLACE )?FUNCTION public\.\w+)/g) ?? [];
    expect(defs.length).toBeGreaterThanOrEqual(2);
    for (const name of ['movement_roles_for_portal_unit', 'tg_sync_movement_role_from_unit']) {
      expect(fnScope(MIG_CODE, name), name).toContain('SET search_path = public');
    }
  });
});

describe('0311 — الجسر: من يُجسَّر ومن لا', () => {
  const scope = fnScope(MIG_CODE, 'movement_roles_for_portal_unit');

  it('المدير على وحدة الحركة يحصل على movement_manager', () => {
    expect(scope).toContain("p_unit_key = 'movement' AND p_base_role = 'manager'");
    expect(scope).toContain("ARRAY['movement_manager']");
  });

  it('★ المشرف لا يُجسَّر — لا ذكر لأي دور حركة مقترن به', () => {
    // أي ظهور لـ supervisor مقرونٍ بمنح دور = تصعيد امتياز
    expect(scope).not.toMatch(/supervisor[^)]*ARRAY\s*\[\s*'(employee_movement|logistics|movement_manager)'/);
  });

  it('★ المشرف لا يحصل على employee_movement (7 صفحات فيها اعتماد وسياسات)', () => {
    expect(scope).not.toContain("'employee_movement'");
  });

  it('الحالة الافتراضية مصفوفة فارغة — قائمة سماح لا منع', () => {
    expect(scope).toContain("ELSE ARRAY[]::TEXT[]");
  });
});

describe('0311 — سلامة المحفّز', () => {
  const scope = fnScope(MIG_CODE, 'tg_sync_movement_role_from_unit');

  it('يُطلق على INSERT و UPDATE للأعمدة المؤثرة', () => {
    expect(MIG_CODE).toContain('AFTER INSERT OR UPDATE OF user_id, base_role, unit_key, is_active');
    expect(MIG_CODE).toContain('ON public.portal_unit_assignments');
  });

  it('يُسقط المحفّز قبل إنشائه (آمن للتكرار)', () => {
    expect(MIG_CODE).toContain('DROP TRIGGER IF EXISTS trg_sync_movement_role_from_unit');
  });

  it('لا حذف نهائي — التعطيل is_active=FALSE', () => {
    expect(scope).toContain('SET is_active  = FALSE');
    expect(scope).not.toMatch(/DELETE\s+FROM\s+public\.movement_role_assignments/);
  });

  it('يمسّ صفوف unit_sync وحدها — لا يتلف manual ولا profile_sync', () => {
    expect(scope).toContain("m.origin    = 'unit_sync'");
  });

  it('يعالج تغيّر user_id فلا يبقى الصف القديم معلّقاً', () => {
    expect(scope).toContain('OLD.user_id IS DISTINCT FROM NEW.user_id');
  });

  it('يفلتر بالمستأجر داخل الاستعلام (منع تسرّب)', () => {
    expect(scope).toContain('a.tenant_id = v_tenant');
  });

  it('★ لا يكتب في جدول مصدر — لا حلقة units → roles → units', () => {
    expect(scope).not.toMatch(/(INSERT INTO|UPDATE)\s+public\.portal_unit_assignments/);
    expect(scope).not.toMatch(/(INSERT INTO|UPDATE)\s+public\.profiles/);
  });
});

describe('0311 — عدم التداخل مع 0300', () => {
  it('محفّز 0300 لا يلمس جدول الوحدات (الاتجاه الآخر)', () => {
    expect(stripComments(M0300)).not.toContain('portal_unit_assignments');
  });

  it('0300 يملك profile_sync و0311 يملك unit_sync — لا تقاطع', () => {
    expect(stripComments(M0300)).toContain("'profile_sync'");
    expect(MIG_CODE).toContain("'unit_sync'");
    expect(MIG_CODE).not.toContain("origin    = 'profile_sync'");
  });
});

describe('0311 — الصلاحيات', () => {
  it('anon محروم صراحةً (منحة Supabase التلقائية لا يسحبها REVOKE FROM PUBLIC)', () => {
    expect(MIG_CODE).toContain('REVOKE ALL ON FUNCTION public.movement_roles_for_portal_unit(TEXT, TEXT) FROM anon');
  });

  it('authenticated و service_role يملكان التنفيذ', () => {
    expect(MIG_CODE).toMatch(/GRANT EXECUTE ON FUNCTION public\.movement_roles_for_portal_unit\(TEXT, TEXT\)\s*\n?\s*TO authenticated, service_role/);
  });
});

describe('0311 — حرّاس داخل المايجريشن', () => {
  it('يتحقق من وجود المحفّز', () => {
    expect(MIG_CODE).toContain("tgname = 'trg_sync_movement_role_from_unit'");
  });

  it('يمنع الحِمل الزائد (إضافة معامل بـ DEFAULT تُنشئ توقيعاً ثانياً)', () => {
    expect(MIG_CODE).toContain("p.proname = 'movement_roles_for_portal_unit'");
    expect(MIG_CODE).toMatch(/ASSERT v_cnt = 1/);
  });

  it('يختبر منع تصعيد المشرف داخل المايجريشن نفسه', () => {
    expect(MIG_CODE).toContain("public.movement_roles_for_portal_unit('supervisor', 'movement')");
    expect(MIG_CODE).toContain('privilege escalation');
  });

  it('يشغّل سيناريو حقيقياً (plpgsql يؤجّل فحص الأعمدة للتشغيل)', () => {
    expect(MIG_CODE).toContain('INSERT INTO public.portal_unit_assignments');
    expect(MIG_CODE).toContain('0311 failed: manager bridge did not fire');
  });

  it('ينظّف مسبار الحارس فلا يترك بيانات', () => {
    expect(MIG_CODE).toContain('DELETE FROM public.tenants                   WHERE id      =  v_t');
  });
});

describe('0311 — الاختبار السلوكي', () => {
  it('يغطي منع تصعيد امتياز المشرف', () => {
    expect(VERIFY).toContain('تصعيد امتياز');
  });

  it('يغطي صيانة الإسناد اليدوي و profile_sync', () => {
    expect(VERIFY).toContain("origin='manual'");
    expect(VERIFY).toContain("origin='profile_sync'");
  });

  it('يغطي العزل بين المستأجرين', () => {
    expect(VERIFY).toContain('تسرّب مستأجر');
  });

  it('يغطي السحب والإعادة بلا تكرار صفوف', () => {
    expect(VERIFY).toContain('يجب الأرشفة لا الحذف');
    expect(VERIFY).toContain('تكرّرت الصفوف');
  });

  it('★ يتحقق أن دور المدير يبقى manager — جوهر الإصلاح', () => {
    expect(VERIFY).toContain('دور المدير يجب أن يبقى manager سليماً');
  });

  it('يوثّق تصحيح التأكيد الخاطئ 12.1 علناً (الصدق قبل الاتساق)', () => {
    expect(VERIFY).toContain('تصحيح صريح');
    expect(VERIFY).toContain('التأكيد كان خاطئاً لا الشيفرة');
  });
});
