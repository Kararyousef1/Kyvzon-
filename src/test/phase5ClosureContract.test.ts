/** عقد إغلاق المرحلة الخامسة محلياً عبر 0374–0378. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const STATUS = read('docs/EMPLOYEE_HR_PORTALS_PLAN_STATUS_2026-08-14.md');
const REPORT = read('docs/PHASE5_PORTAL_INTEGRATION_CLOSURE_2026-08-15.md');
const PLAN = read('docs/PLAN_EMPLOYEE_HR_PORTALS.md');

describe('المرحلة الخامسة — إغلاق البنود العشرة', () => {
  it('الحالة العامة مكتملة محلياً لا Runtime مزعوماً', () => {
    expect(STATUS).toContain('**5 — الترابط بين البوابات**');
    expect(STATUS).toContain('✅ مكتملة محلياً عبر `0374`–`0378`');
    expect(REPORT).toContain('التطبيق Runtime');
    expect(REPORT).toContain('لا يدعي هذا الإغلاق تطبيق المهاجرات');
  });

  it.each([
    'ربط `ContactPage`',
    'نقل مستهلكي اعتماد HR',
    'ربط التوظيف بالحساب والعقد',
    'ربط المكافآت بالرواتب',
    'تفعيل خطط تطوير التعاقب',
    'واجهة تسجيل التنفيذ الفعلي',
    'واجهة HR لامتثال SOP',
    'واجهة لصحة أجهزة البصمة',
    'استكمال نقطة دخول الحركة',
    'إكمال تدريب الموظف',
  ])('%s معلّم كمغلق', (item) => {
    const line = STATUS.split('\n').find((value) => value.includes(item));
    expect(line).toBeTruthy();
    expect(line).toContain('~~');
    expect(line).toContain('✅');
  });

  it('المهاجرات التراكمية الخمس موثقة', () => {
    for (const migration of ['0374','0375','0376','0377','0378']) {
      expect(REPORT).toContain(migration);
    }
  });

  it('قرار عدم حذف hr_approval_steps ما زال صريحاً', () => {
    expect(REPORT).toContain('لا تدّعي حذف الجدول');
    expect(REPORT).toContain('إسقاط الجدول الآن غير آمن');
    expect(PLAN).toContain('لا حذف مع اعتماد DB حي');
  });

  it('الخطة تنقل العمل التالي إلى المرحلة السادسة', () => {
    expect(PLAN).toContain('المرحلة 6 هي التالية');
    expect(STATUS).toContain('بدء المرحلة 6');
  });
});
