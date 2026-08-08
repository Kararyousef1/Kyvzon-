/**
 * ═════════════════════════════════════════════════════════════════════════
 *  constants.test.ts — يضمن أن ROLE_DEFAULT_PATH يغطي كل الأدوار المدعومة
 *
 *  ─────────────────────────────────────────────────────────────────────
 *  ★ سبب إعادة الكتابة (2026-08-05):
 *
 *  النسخة السابقة فحصت قائمة **مكتوبة يدوياً** من ثمانية أدوار:
 *      ['developer','hr','admin','employee','gatekeeper','supervisor','manager','it_admin']
 *  بينما UserRole يحوي 18 دوراً. فالأدوار العشرة المضافة بعد كتابة الاختبار
 *  (finance … movement_manager) لم تُفحص إطلاقاً.
 *
 *  النتيجة: ثلاثة أدوار — employee_movement · logistics · movement_manager —
 *  بقيت بلا مسار افتراضي، فوقعت حلقة إعادة توجيه لا نهائية:
 *      getDefaultPathForRole → '/app/employee' → RequireRole يرفض
 *      → getDefaultPathForRole → '/app/employee' → …
 *
 *  الدرس: القائمة اليدوية لا تلاحق مصدر الحقيقة. هذا الملف الآن **يشتقّ**
 *  الأدوار من نص `export type UserRole` مباشرةً، فأي دور جديد يُضاف للنظام
 *  يُفحص تلقائياً دون تعديل هذا الملف.
 *
 *  لا نستورد الأنواع كقيم (الأنواع تُمحى وقت التنفيذ) — نقرأ الملف نصّاً،
 *  وهو النمط المتبَع في اختبارات العقد بالمشروع.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROLE_DEFAULT_PATH, getDefaultPathForRole } from '../../router/constants';

/** يستخرج أدوار UserRole من مصدر الحقيقة نصّاً */
function readUserRoles(): string[] {
  const src = readFileSync(
    resolve(__dirname, '../../shared/types/index.ts'),
    'utf-8',
  );
  const line = src.split('\n').find((l) => l.includes('export type UserRole'));
  if (!line) throw new Error('تعذّر إيجاد export type UserRole في shared/types/index.ts');
  const roles = [...line.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  if (roles.length === 0) throw new Error('UserRole بلا أدوار — تغيّر شكل التعريف؟');
  return roles;
}

const USER_ROLES = readUserRoles();

describe('ROLE_DEFAULT_PATH', () => {
  it('مصدر الحقيقة يحوي 18 دوراً على الأقل (حارس ضد قراءة فاشلة)', () => {
    expect(USER_ROLES.length).toBeGreaterThanOrEqual(18);
  });

  it('يغطي كل دور في UserRole — لا استثناء', () => {
    const missing = USER_ROLES.filter((r) => !ROLE_DEFAULT_PATH[r]);
    expect(
      missing,
      `أدوار بلا مسار افتراضي ⇒ حلقة إعادة توجيه لا نهائية: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('لا يحوي مفاتيح لأدوار غير معرّفة في UserRole', () => {
    const extra = Object.keys(ROLE_DEFAULT_PATH).filter((r) => !USER_ROLES.includes(r));
    expect(extra, `مفاتيح زائدة: ${extra.join(', ')}`).toEqual([]);
  });

  it('كل المسارات تبدأ بـ /app أو /dev', () => {
    for (const [role, path] of Object.entries(ROLE_DEFAULT_PATH)) {
      const ok = path.startsWith('/app') || path === '/dev';
      expect(ok, `${role} → ${path}`).toBe(true);
    }
  });

  it('أدوار بوابة الحركة الثلاثة تُوجَّه لبوابة الحركة لا لبوابة الموظف', () => {
    // '/app/employee' محروس بـ roles={['employee','supervisor','manager']}
    // فتوجيه دور حركة إليه يُعيد إنتاج الحلقة بالضبط.
    for (const role of ['employee_movement', 'logistics', 'movement_manager']) {
      expect(ROLE_DEFAULT_PATH[role], `${role} يجب ألّا يُوجَّه لبوابة الموظف`)
        .toBe('/app/movement');
    }
  });
});

describe('getDefaultPathForRole()', () => {
  it('يعيد المسار الصحيح لكل دور معروف', () => {
    expect(getDefaultPathForRole('hr')).toBe('/app/hr');
    expect(getDefaultPathForRole('admin')).toBe('/app/admin');
    expect(getDefaultPathForRole('developer')).toBe('/dev');
    expect(getDefaultPathForRole('gatekeeper')).toBe('/app/gatekeeper');
    expect(getDefaultPathForRole('movement_manager')).toBe('/app/movement');
  });

  it('لا يعيد /app/employee لأي دور معرَّف غير employee نفسه', () => {
    // الالتقاط المباشر للحلقة: أي دور آخر يهبط على /app/employee
    // سيُرفض من RequireRole ثم يُعاد توجيهه إلى نفسه.
    for (const role of USER_ROLES) {
      if (role === 'employee' || role === 'supervisor' || role === 'manager') continue;
      expect(
        getDefaultPathForRole(role),
        `${role} يهبط على /app/employee المحروس ⇒ حلقة`,
      ).not.toBe('/app/employee');
    }
  });

  it('يعيد /app/employee للأدوار غير المعروفة (fallback آمن)', () => {
    expect(getDefaultPathForRole('unknown_role')).toBe('/app/employee');
    expect(getDefaultPathForRole('')).toBe('/app/employee');
    expect(getDefaultPathForRole(undefined)).toBe('/app/employee');
  });
});
