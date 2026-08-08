/**
 * movementRoleSyncContract.test.ts
 *
 * عقد مزامنة أدوار بوابة الحركة (مايجريشن 0300) + تطابق الشريط الجانبي
 * مع حارس المسار.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * العطل الذي يحرس ضده (مُشاهَد في المتصفح 2026-08-04):
 *
 *   مستخدم profiles.role = 'movement_manager' فتح البوابة فرأى
 *   «لم يُسنَد إليك أي دور في بوابة الحركة»، بينما الشريط الجانبي
 *   يعرض له 22 صفحة.
 *
 *   ثلاثة مصادر مختلفة للحقيقة:
 *     • الشريط العلوي   → profiles.role
 *     • حارس الصفحة     → movement_role_assignments
 *     • الشريط الجانبي  → localStorage
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const MIGRATION = read('supabase/migrations/0300_movement_role_assignment_sync.sql');
const SIDEBAR = read('src/shared/components/dashboard/Sidebar.tsx');
const VERIFY = read('tools/dev/verify-movement-0300.sql');

describe('0300 — محفّز مزامنة أدوار الحركة', () => {
  it('يُنشئ المحفّز على public.profiles', () => {
    expect(MIGRATION).toMatch(
      /CREATE TRIGGER trg_sync_movement_role_assignment\s+AFTER INSERT OR UPDATE OF role, tenant_id ON public\.profiles/,
    );
  });

  it('المحفّز يُسقَط أولاً ليكون آمناً للتكرار', () => {
    expect(MIGRATION).toContain(
      'DROP TRIGGER IF EXISTS trg_sync_movement_role_assignment ON public.profiles',
    );
  });

  it('يضيف عمود origin بقيمة افتراضية manual', () => {
    expect(MIGRATION).toMatch(
      /ADD COLUMN IF NOT EXISTS origin VARCHAR\(20\) NOT NULL DEFAULT 'manual'/,
    );
  });

  it('قيد origin يقتصر على manual و profile_sync', () => {
    expect(MIGRATION).toMatch(/CHECK \(origin IN \('manual', 'profile_sync'\)\)/);
  });

  it('يُعطّل ولا يحذف — سياسة archive بدل DELETE', () => {
    // لا حذف نهائي في منطق المزامنة
    const syncFn = MIGRATION.slice(
      MIGRATION.indexOf('tg_sync_movement_role_assignment()'),
      MIGRATION.indexOf('CREATE TRIGGER'),
    );
    expect(syncFn).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(syncFn).toMatch(/SET\s+is_active\s*=\s*FALSE/i);
  });

  it('يُعطّل فقط ما اشتُقّ تلقائياً — الإسناد اليدوي مُصان', () => {
    expect(MIGRATION).toMatch(/AND a\.origin\s*=\s*'profile_sync'/);
  });

  it('دالة التحويل صرفة IMMUTABLE', () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.movement_roles_for_profile_role\(p_profile_role TEXT\)[\s\S]{0,200}IMMUTABLE/,
    );
  });

  it('anon محروم صراحةً من التنفيذ', () => {
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.movement_roles_for_profile_role\(TEXT\) FROM anon/,
    );
  });

  it('يحوي حارس has_function_privilege ضد تسرّب anon', () => {
    expect(MIGRATION).toMatch(
      /ASSERT NOT has_function_privilege\('anon',[\s\S]{0,120}'EXECUTE'\)/,
    );
  });

  it('يحوي حارساً ضد اليتامى (دور حركة بلا إسناد)', () => {
    expect(MIGRATION).toMatch(/0300 failed: %s profile\(s\) with movement role lack assignment/);
  });

  it('يحوي حارس overloads = 1', () => {
    expect(MIGRATION).toMatch(/0300 failed: overloads \(must be 1\)/);
  });

  it('يرحّل البيانات الأثرية لمن أُسنِد قبل المايجريشن', () => {
    expect(MIGRATION).toMatch(/ترحيل أثري 0300 من profiles\.role/);
    expect(MIGRATION).toMatch(/ON CONFLICT \(tenant_id, user_id, portal_role\) DO UPDATE/);
  });

  it('يتخطى profiles بلا tenant_id بدل الانهيار', () => {
    expect(MIGRATION).toMatch(/IF NEW\.tenant_id IS NULL THEN\s+RETURN NEW;/);
  });

  it('الأدوار الثلاثة كلها مُغطّاة في دالة التحويل', () => {
    for (const role of ['movement_manager', 'logistics', 'employee_movement']) {
      expect(MIGRATION).toContain(`WHEN '${role}'`);
    }
  });
});

describe('0300 — الاختبار السلوكي موجود', () => {
  it('ملف التحقق يغطي الحالات الحرجة', () => {
    expect(VERIFY).toContain('الإسناد اليدوي يصمد أمام تغيير وسحب الدور');
    expect(VERIFY).toContain('لا حذف نهائي — الصف القديم محفوظ');
    expect(VERIFY).toContain('profile بلا tenant_id لا يكسر المحفّز');
    expect(VERIFY).toContain('لا يوجد profile بدور حركة بلا إسناد فعّال');
  });

  it('يفشل بصوت عالٍ عند أي اختبار ساقط', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ 0300 verify: % اختباراً فشل'/);
  });
});

describe('الشريط الجانبي — تطابق المعروض مع المسموح', () => {
  it('يستورد useMovementRoles بدل قراءة localStorage', () => {
    expect(SIDEBAR).toMatch(
      /import \{ useMovementRoles \} from '\.\.\/\.\.\/hooks\/useMovementRoles'/,
    );
  });

  it('لا يقرأ activeRole من localStorage مباشرة', () => {
    expect(SIDEBAR).not.toMatch(/localStorage\.getItem\('kyvzon\.movement\.activeRole'\)/);
  });

  it('يُخفي قسم الحركة كاملاً لمن لا دور له ولا سجل سائق', () => {
    // تحديث 2026-08-05 (الجولة ١): صار الشرط مركّباً بعد فصل وصول
    // السائق عن دور مدير الأسطول (0301). السائق دوره في profiles
    // غالباً 'employee' وليس له دور بوابة، ومع ذلك يجب أن يرى صفحته.
    expect(SIDEBAR).toMatch(/if \(movement\.roles\.length === 0\) \{/);
    expect(SIDEBAR).toMatch(/if \(!movement\.isDriver\) return \[\];/);
  });

  it('لا يعرض القسم قبل تحميل الأدوار (تفادي الوميض)', () => {
    expect(SIDEBAR).toMatch(/if \(!movement\.loaded\) return \[\];/);
  });

  it('يمرّر أدوار الحركة إلى دالة الفلترة', () => {
    expect(SIDEBAR).toMatch(/splitInventorySection\(section, \{[\s\S]{0,160}roles: movementRoles/);
  });

  it('يفلتر حسب الأدوار المملوكة لا حسب profiles.role', () => {
    expect(SIDEBAR).toMatch(/movement\.roles\.includes\('employee_movement'\) \? EMP_IDS/);
    expect(SIDEBAR).toMatch(/movement\.roles\.includes\('logistics'\) \? LOG_IDS/);
  });
});
