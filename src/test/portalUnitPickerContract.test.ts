/**
 * portalUnitPickerContract.test.ts
 *
 * عقد الخطوة ٢ — واجهة إسناد الوحدات في معالج إدارة المستخدمين.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ما يحرس ضده:
 *   ① عودة عطل department_id الفارغ عند التحرير ⇒ فشل قيد النطاق
 *   ② حفظ وحدة بنطاق ناقص (يفشل في القاعدة بعد نصف الحفظ)
 *   ③ اختيار وحدة «مخطَّطة» بلا صفحات ⇒ وعد كاذب
 *   ④ بقاء صفحات وحدة منزوعة في allowed_pages
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validatePortalUnits,
  type SelectedPortalUnit,
} from '../pages/admin/components/PortalUnitPicker';
import { PORTAL_UNITS, unitsForBaseRole } from '../shared/constants/portalUnits';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const PICKER = read('src/pages/admin/components/PortalUnitPicker.tsx');
const ADMIN = read('src/pages/admin/AdminEmployeesPage.tsx');
const VERIFY = read('tools/dev/verify-portal-units-sync.sql');

describe('validatePortalUnits — التحقق قبل الحفظ', () => {
  it('يقبل نطاق قسم مع معرّف', () => {
    const units: SelectedPortalUnit[] = [
      { unitKey: 'movement', scopeType: 'department', scopeId: 'dept-1' },
    ];
    expect(validatePortalUnits(units)).toBeNull();
  });

  it('يرفض نطاق قسم بلا معرّف', () => {
    const units: SelectedPortalUnit[] = [
      { unitKey: 'movement', scopeType: 'department', scopeId: null },
    ];
    expect(validatePortalUnits(units)).toContain('movement');
  });

  it('يرفض نطاق فرع بلا معرّف', () => {
    const units: SelectedPortalUnit[] = [
      { unitKey: 'hr', scopeType: 'branch', scopeId: '' },
    ];
    expect(validatePortalUnits(units)).not.toBeNull();
  });

  it('يقبل نطاق الشركة بلا معرّف', () => {
    const units: SelectedPortalUnit[] = [
      { unitKey: 'movement', scopeType: 'tenant', scopeId: null },
    ];
    expect(validatePortalUnits(units)).toBeNull();
  });

  it('يرفض نطاق الشركة مع معرّف (يخالف قيد 0302)', () => {
    const units: SelectedPortalUnit[] = [
      { unitKey: 'movement', scopeType: 'tenant', scopeId: 'dept-1' },
    ];
    expect(validatePortalUnits(units)).not.toBeNull();
  });

  it('يقبل قائمة فارغة', () => {
    expect(validatePortalUnits([])).toBeNull();
  });

  it('يكتشف الخطأ في أي عنصر لا الأول فقط', () => {
    const units: SelectedPortalUnit[] = [
      { unitKey: 'movement', scopeType: 'tenant', scopeId: null },
      { unitKey: 'hr', scopeType: 'department', scopeId: null },
    ];
    expect(validatePortalUnits(units)).toContain('hr');
  });
});

describe('PortalUnitPicker — سلوك المكوّن', () => {
  it('يظهر للمدير والمشرف فقط', () => {
    expect(ADMIN).toMatch(/\{unitBaseRole\(form\.role\) && \(/);
  });

  it('الوحدات المخطَّطة معطَّلة بوسم «قريباً» (لا وعد كاذب)', () => {
    expect(PICKER).toMatch(/isPlanned/);
    expect(PICKER).toMatch(/disabled=\{isPlanned\}/);
    expect(PICKER).toContain('قريباً');
  });

  it('لا يختار نطاق «قسم» بلا معرّف قسم', () => {
    // القيد في القاعدة يرفضه — المكوّن يتفاداه بالافتراضي
    expect(PICKER).toMatch(
      /employeeDepartmentId[\s\S]{0,120}scopeType: 'tenant', scopeId: null/,
    );
  });

  it('يُصفّر scopeId عند اختيار نطاق الشركة', () => {
    expect(PICKER).toMatch(/scopeId: scopeType === 'tenant' \? null : scopeId/);
  });

  it('يحذّر عند اختيار نطاق الشركة كاملة', () => {
    expect(PICKER).toContain('نطاق الشركة كاملة');
    expect(PICKER).toContain('لا فريقه وحده');
  });

  it('ينبّه على نطاق فارغ قبل الحفظ', () => {
    expect(PICKER).toMatch(/لا يمكن\s*الحفظ بنطاق فارغ/);
  });

  it('يعرض عدد صفحات كل وحدة نشطة', () => {
    expect(PICKER).toMatch(/pagesForUnit\(unit, baseRole\)\.length/);
  });

  it('لا يستخدم prompt أو confirm', () => {
    const code = PICKER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/(?<![.\w])prompt\(/);
    expect(code).not.toMatch(/(?<![.\w])confirm\(/);
  });
});

describe('AdminEmployeesPage — التكامل', () => {
  it('يستنتج department_id عند التحرير (إصلاح العائق ١)', () => {
    // كان department_id:'' دائماً فيفشل إسناد نطاق القسم
    expect(ADMIN).not.toMatch(/department_id:\s*'',\s*\n\s*position:/);
    expect(ADMIN).toMatch(
      /department_id: departments\.find\([\s\S]{0,220}name_ar[\s\S]{0,160}emp\.department/,
    );
  });

  it('يحمّل وحدات المستخدم القائمة عند التحرير', () => {
    expect(ADMIN).toMatch(/portalUnitService\.findForUser\(emp\.id\)/);
  });

  it('يتحقق من الوحدات قبل أي كتابة', () => {
    const save = ADMIN.slice(ADMIN.indexOf('const handleSave'));
    const validate = save.indexOf('validatePortalUnits');
    const firstWrite = save.indexOf('setSaving(true)');
    expect(validate).toBeGreaterThan(-1);
    expect(validate).toBeLessThan(firstWrite);
  });

  it('يعيد المستخدم للخطوة ٣ عند خطأ الوحدات', () => {
    expect(ADMIN).toMatch(/addToast\(unitError, 'error'\);[\s\S]{0,60}setWizardStep\(3\)/);
  });

  it('يزامن الوحدات في مسار التحرير', () => {
    const editPath = ADMIN.slice(
      ADMIN.indexOf("if (formMode === 'edit' && selectedEmp)"),
      ADMIN.indexOf('// ─── Create'),
    );
    expect(editPath).toMatch(/portalUnitService\.syncUserUnits\(/);
  });

  it('يزامن الوحدات في مسار الإنشاء', () => {
    const createPath = ADMIN.slice(ADMIN.indexOf('// ─── Create'));
    expect(createPath).toMatch(/portalUnitService\.syncUserUnits\(/);
    expect(createPath).toMatch(/newUserId/);
  });

  it('تغيير الدور لغير مدير/مشرف يُعطّل الوحدات (قائمة فارغة)', () => {
    expect(ADMIN).toMatch(/base\s*\n?\s*\?\s*form\.portal_units\.map[\s\S]{0,400}:\s*\[\],/);
  });

  it('فشل مزامنة الوحدات لا يُخفى خلف رسالة نجاح', () => {
    expect(ADMIN).toContain('تعذّرت مزامنة وحدات البوابة');
    expect(ADMIN).toContain('تعذّر إسناد وحدات البوابة');
  });

  it('صفحات الوحدات تُضاف إلى allowed_pages', () => {
    expect(ADMIN).toMatch(/const selectedUnitPages = pagesFromUnits\(/);
    expect(ADMIN).toMatch(/\.\.\.selectedUnitPages/);
  });

  it('صفحات الوحدات المنزوعة تُزال من allowed_pages', () => {
    expect(ADMIN).toMatch(/allKnownUnitPages = new Set\(allUnitPageIds\(\)\)/);
    expect(ADMIN).toMatch(/basePages\.filter\(id => !allKnownUnitPages\.has\(id\)\)/);
  });
});

describe('اتساق الكتالوج مع الواجهة', () => {
  it('كل الوحدات التسع نشطة', () => {
    // تحديث 2026-08-05: كانت الحركة وحدها نشطة كنموذج أول. بعد إثبات
    // أن المحرك الموحّد (0305) يخدم كل الوحدات، فُعِّلت الثماني الباقية
    // بصفحة عامة واحدة (UnitApprovalsPage) بدل نسخ 16 صفحة.
    const planned = PORTAL_UNITS.filter((u) => u.status === 'planned');
    expect(planned.map((u) => u.unitKey)).toEqual([]);
    expect(PORTAL_UNITS).toHaveLength(9);
  });

  it('المدير يرى تسع وحدات (نشطة ومخطَّطة)', () => {
    expect(unitsForBaseRole('manager')).toHaveLength(9);
  });

  it('المشرف يرى خمس وحدات', () => {
    expect(unitsForBaseRole('supervisor')).toHaveLength(5);
  });

  it('كل وحدة نشطة لها صفحة واحدة على الأقل للمدير', () => {
    for (const u of PORTAL_UNITS.filter((x) => x.status === 'active')) {
      expect(u.managerPages.length).toBeGreaterThan(0);
    }
  });
});

describe('الاختبار السلوكي للمزامنة', () => {
  it('يغطي الحالات الحرجة', () => {
    expect(VERIFY).toContain('نزع الوحدة يُعطّلها ولا يحذفها');
    expect(VERIFY).toContain('تغيير الدور لموظف يُعطّل كل الوحدات');
    expect(VERIFY).toContain('يرفض نطاق قسم بلا معرّف');
    expect(VERIFY).toContain('إعادة الإسناد تُفعّل الصف القائم بلا تكرار');
  });

  it('يفشل بصوت عالٍ', () => {
    expect(VERIFY).toMatch(/RAISE EXCEPTION '❌ % اختباراً فشل'/);
  });
});
