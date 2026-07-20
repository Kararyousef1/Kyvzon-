/**
 * ═════════════════════════════════════════════════════════════════════════
 *  hybridPagesCatalog.test.ts — اختبارات منطق الاشتراك الهجين
 *
 *  يختبر جوهر إغلاق الثغرة:
 *   - buildHybridPagesForUser : features ∩ role + always-on
 *   - isPathAllowedForHybrid   : فحص المسار على مستوى الصفحة + الدور
 *   - resolvePageForPath       : تحويل المسار إلى page-id
 * ═════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect } from 'vitest';
import {
  buildHybridPagesForUser,
  isPathAllowedForHybrid,
  resolvePageForPath,
  getHybridLandingPath,
  hybridEnabledModulesForFeatures,
  HYBRID_CATALOG,
} from '../pages/hybridportal/hybridPagesCatalog';
import { getModuleForPath } from '../router/moduleMap';

describe('hybridPagesCatalog', () => {
  // شركة خصّص لها: رواتب HR + إدارة موظفين HR + طلبات الموظف + تقييم الأداء
  const FEATURES = ['hr-payroll', 'hr-team', 'employee-requests', 'hr-performance'];

  describe('buildHybridPagesForUser — فلترة features + الدور', () => {
    it('الموظف يرى الصفحات المسموحة لدوره فقط (لا الرواتب/الإدارة الحساسة)', () => {
      const pages = buildHybridPagesForUser(FEATURES, 'employee');
      const ids = pages.map((p) => p.id);
      // employee-requests مسموح للموظف
      expect(ids).toContain('employee-requests');
      // hr-payroll / hr-team ليست ضمن أدوار الموظف
      expect(ids).not.toContain('hr-payroll');
      expect(ids).not.toContain('hr-team');
    });

    it('المدير يرى تقييم الأداء (مسموح له) لكن ليس رواتب/إدارة HR', () => {
      const pages = buildHybridPagesForUser(FEATURES, 'manager');
      const ids = pages.map((p) => p.id);
      expect(ids).toContain('hr-performance'); // manager ضمن roles
      expect(ids).not.toContain('hr-payroll'); // hr/admin فقط
    });

    it('HR/admin يرى الصفحات الحساسة (رواتب + إدارة)', () => {
      const pages = buildHybridPagesForUser(FEATURES, 'hr');
      const ids = pages.map((p) => p.id);
      expect(ids).toContain('hr-payroll');
      expect(ids).toContain('hr-team');
      expect(ids).toContain('hr-performance');
    });

    it('الصفحة الأساسية (الحساب) تظهر دائماً بغض النظر عن features', () => {
      const pages = buildHybridPagesForUser([], 'employee');
      const ids = pages.map((p) => p.id);
      expect(ids).toContain('employee-profile');
      // الإشعارات لا تُدرَج في الكتالوج (تُعرَض بتصميم خاص في footer) لتجنّب التكرار
      expect(ids).not.toContain('my-notifications');
    });

    it('مسار الإشعارات مسموح دائماً للهجين (عبر المسارات الأساسية)', () => {
      const r = isPathAllowedForHybrid('/app/my-notifications', [], 'employee');
      expect(r.allowed).toBe(true);
    });

    it('بلا دور → لا صفحات (آمن افتراضياً)', () => {
      expect(buildHybridPagesForUser(FEATURES, null)).toEqual([]);
    });

    it('كل صفحة مُرجَعة تملك مساراً صالحاً', () => {
      const pages = buildHybridPagesForUser(FEATURES, 'hr');
      expect(pages.length).toBeGreaterThan(0);
      pages.forEach((p) => expect(p.path).toBeTruthy());
    });
  });

  describe('resolvePageForPath — المسار إلى page-id', () => {
    it('يطابق المسار التام', () => {
      expect(resolvePageForPath('/app/hr/payroll')?.id).toBe('hr-payroll');
    });

    it('يطابق المسارات الفرعية (تفاصيل)', () => {
      expect(resolvePageForPath('/app/hr/payroll/123')?.id).toBe('hr-payroll');
    });

    it('يُرجع null لمسار غير معروف', () => {
      expect(resolvePageForPath('/app/nonexistent-xyz')).toBeNull();
    });
  });

  describe('isPathAllowedForHybrid — إغلاق الثغرة على مستوى الصفحة', () => {
    it('يسمح بصفحة ضمن features + دور مسموح', () => {
      const r = isPathAllowedForHybrid('/app/hr/payroll', FEATURES, 'hr');
      expect(r.allowed).toBe(true);
    });

    it('يمنع صفحة غير مخصّصة للشركة (not-in-features) — جوهر الثغرة', () => {
      // hr-recruitment ليست ضمن FEATURES، رغم أن الوحدة hr مفعّلة
      const r = isPathAllowedForHybrid('/app/hr/recruitment', FEATURES, 'hr');
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('not-in-features');
    });

    it('يمنع صفحة مخصّصة لكن دور المستخدم لا يسمح (role-denied)', () => {
      // hr-payroll مخصّصة، لكن الموظف لا يُسمح له
      const r = isPathAllowedForHybrid('/app/hr/payroll', FEATURES, 'employee');
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('role-denied');
    });

    it('يمنع المسارات المجهولة تماماً', () => {
      const r = isPathAllowedForHybrid('/app/secret-xyz', FEATURES, 'hr');
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('unknown');
    });

    it('يسمح دائماً بالصفحات الأساسية (الحساب) حتى بلا features', () => {
      const r = isPathAllowedForHybrid('/app/employee/profile', [], 'employee');
      expect(r.allowed).toBe(true);
    });
  });

  describe('getHybridLandingPath — التوجيه بعد الدخول', () => {
    it('يوجّه لأول صفحة مخصّصة (وليس الأساسية) للـ HR', () => {
      const landing = getHybridLandingPath(FEATURES, 'hr');
      // يجب أن يكون مساراً حقيقياً لصفحة مخصّصة، لا الملف الشخصي الأساسي
      expect(landing).toBeTruthy();
      expect(landing).not.toBe('/app/employee/profile');
    });

    it('يوجّه لصفحة مسموحة لدور الموظف', () => {
      const landing = getHybridLandingPath(FEATURES, 'employee');
      // employee-requests هي الوحيدة المخصّصة والمسموحة للموظف
      expect(landing).toBe('/app/employee/leave-requests');
    });

    it('يُرجع null إن لم تتوفّر أي صفحة مخصّصة ولا أساسية مطابقة للدور', () => {
      // دور بلا أي صفحة في القائمة → لكن الأساسيات تشمل كل الأدوار،
      // لذا لن يكون null إلا في حالة بلا دور
      expect(getHybridLandingPath(FEATURES, null)).toBeNull();
    });

    it('يوجّه للأساسية (الحساب) إن لم تُخصّص أي صفحة', () => {
      const landing = getHybridLandingPath([], 'employee');
      expect(landing).toBe('/app/employee/profile');
    });
  });

  describe('تطابق الوحدات — يحرس ضد "البوابة غير مفعلة"', () => {
    it('كل صفحة في الكتالوج تُفعّل الوحدة التي يطلبها RequireModule من مسارها', () => {
      const mismatches: string[] = [];

      for (const page of HYBRID_CATALOG) {
        if (!page.path) continue;
        const required = getModuleForPath(page.path)?.moduleKey;
        // required === undefined/null → لا فحص module لهذا المسار → دائماً مسموح
        if (!required) continue;

        const activated = hybridEnabledModulesForFeatures([page.id]);
        if (!activated.includes(required)) {
          mismatches.push(`${page.id} (path=${page.path}) requires '${required}' but activates [${activated.join(',')}]`);
        }
      }

      expect(mismatches).toEqual([]);
    });

    it('صفحات الوحدات الفرعية تُفعّل وحدتها الدقيقة', () => {
      // hr-contracts → وحدة contracts (وليس hr فقط)
      expect(hybridEnabledModulesForFeatures(['hr-contracts'])).toContain('contracts');
      // hr-health-safety → health_safety
      expect(hybridEnabledModulesForFeatures(['hr-health-safety'])).toContain('health_safety');
      // gatekeeper-movements → movement
      expect(hybridEnabledModulesForFeatures(['gatekeeper-movements'])).toContain('movement');
      // biometric-devices → tech_portal (كان الخطأ الأصلي: البوابة التقنية غير مفعلة)
      expect(hybridEnabledModulesForFeatures(['biometric-devices'])).toContain('tech_portal');
    });

    it('employee و tawathul مفعّلتان دائماً للهجين', () => {
      const mods = hybridEnabledModulesForFeatures([]);
      expect(mods).toContain('employee');
      expect(mods).toContain('tawathul');
    });
  });
});
