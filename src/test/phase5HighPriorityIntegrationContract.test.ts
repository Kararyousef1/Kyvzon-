/** عقد 0377 — Bonus→Payroll وSuccession→Training. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const M = read('supabase/migrations/0377_bonus_payroll_and_succession_training.sql');
const BONUS = read('src/services/sdk/BonusService.ts');
const BONUS_PAGE = read('src/pages/hr/BonusesPage.tsx');
const PAYROLL = read('src/services/sdk/PayrollRunService.ts');
const PAYROLL_PAGE = read('src/pages/hr/PayrollPage.tsx');
const SUCCESSION = read('src/services/sdk/SuccessionPlanningService.ts');
const SUCCESSION_PAGE = read('src/pages/hr/SuccessionPlanningPage.tsx');
const TRAINING = read('src/pages/employee/TrainingPage.tsx');

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
}

describe('0377 — Bonus → Payroll', () => {
  it('الروابط tenant-scoped وRESTRICT', () => {
    expect(M).toMatch(/FOREIGN KEY \(payroll_period_id, tenant_id\)[\s\S]{0,100}REFERENCES public\.payroll_periods\(id, tenant_id\) ON DELETE RESTRICT/);
    expect(M).toMatch(/FOREIGN KEY \(payroll_record_id, tenant_id\)[\s\S]{0,100}REFERENCES public\.payroll_records\(id, tenant_id\) ON DELETE RESTRICT/);
  });

  it('payroll_run تطالب approved فقط وتمنع الربط بفترة ثانية', () => {
    const body = M.slice(M.indexOf('CREATE FUNCTION public.payroll_run('), M.indexOf('COMMENT ON FUNCTION public.payroll_run'));
    expect(body).toMatch(/b\.status = 'approved'/);
    expect(body).toMatch(/b\.archived_at IS NULL/);
    expect(body).toMatch(/b\.payroll_period_id IS NULL OR b\.payroll_period_id = p_period_id/);
    expect(body).toMatch(/COALESCE\(b\.period_start, b\.bonus_date\) <= v_end/);
  });

  it('bonus_amount وnet من مجموع الروابط لا قيمة يدوية', () => {
    expect(M).toMatch(/SET bonus_amount = x\.amount/);
    expect(M).toMatch(/r\.basic_salary \+ r\.total_allowances \+ r\.overtime_pay[\s\S]{0,80}\+ x\.amount - r\.total_deductions/);
  });

  it('الصرف يحول الفترة والسجلات والمكافآت معاً', () => {
    const body = M.slice(M.indexOf('CREATE FUNCTION public.payroll_mark_paid'), M.indexOf('COMMENT ON FUNCTION public.payroll_mark_paid'));
    expect(body).toMatch(/PAYROLL_PAYMENT_REQUIRES_APPROVED/);
    expect(body).toMatch(/UPDATE public\.payroll_records[\s\S]{0,120}status = 'paid'/);
    expect(body).toMatch(/UPDATE public\.bonuses[\s\S]{0,100}status = 'paid'/);
    expect(body).toMatch(/UPDATE public\.payroll_periods[\s\S]{0,100}status = 'paid'/);
  });

  it('الدفع اليدوي للمكافأة محجوب بعد 0377', () => {
    expect(M).toContain('BONUS_USE_PAYROLL_PAYMENT');
    expect(BONUS).toMatch(/approved:\s*\['cancelled'\]/);
    expect(BONUS).not.toMatch(/approved:\s*\[[^\]]*'paid'/);
  });

  it('الواجهتان تعرضان الربط وتأكيد الصرف', () => {
    expect(BONUS_PAGE).toContain('ستُصرف من فترة الرواتب المطابقة');
    expect(BONUS_PAGE).toContain('ضمن راتب:');
    expect(PAYROLL).toMatch(/async markPaid\(/);
    expect(PAYROLL_PAGE).toContain('تأكيد صرف الرواتب');
    expect(PAYROLL_PAGE).toMatch(/payrollRunService\.markPaid/);
  });
});

describe('0377 — Succession → Training', () => {
  it('الخطة ترتبط بالدورة والتقدم داخل tenant', () => {
    expect(M).toMatch(/FOREIGN KEY \(course_id, tenant_id\)[\s\S]{0,100}REFERENCES public\.courses\(id, tenant_id\) ON DELETE RESTRICT/);
    expect(M).toMatch(/FOREIGN KEY \(course_progress_id, tenant_id\)[\s\S]{0,100}REFERENCES public\.course_progress\(id, tenant_id\) ON DELETE RESTRICT/);
    expect(M).toMatch(/action_type NOT IN \('training','certification'\) OR course_id IS NOT NULL/);
  });

  it('إنشاء الخطة يكلّف المرشح بالدورة ذرياً', () => {
    const body = M.slice(M.indexOf('CREATE FUNCTION public.succession_plan_create'), M.indexOf('REVOKE ALL ON FUNCTION public.succession_plan_create'));
    expect(body).toMatch(/SELECT c\.employee_id INTO v_employee/);
    expect(body).toMatch(/INSERT INTO public\.course_progress/);
    expect(body).toMatch(/ON CONFLICT \(employee_id, course_id\) DO UPDATE/);
    expect(body).toMatch(/INSERT INTO public\.succession_development_plans/);
  });

  it('إتمام التدريب يغلق خطة التطوير تلقائياً', () => {
    expect(M).toMatch(/CREATE TRIGGER trg_sync_succession_plan_from_training/);
    expect(M).toMatch(/CASE WHEN NEW\.completed THEN 'completed' ELSE 'in_progress' END/);
    expect(M).toMatch(/p\.course_progress_id=NEW\.id/);
  });

  it('الخطة لا تُحذف والإكمال اليدوي لا يتجاوز الدورة', () => {
    expect(M).toContain('SUCCESSION_PLAN_DELETE_BLOCKED');
    expect(M).toContain('SUCCESSION_TRAINING_NOT_COMPLETED');
    expect(M).toContain('SUCCESSION_PLAN_CANCEL_REASON_REQUIRED');
  });

  it('خدمة وصفحة التعاقب تستخدمان RPC وتعرضان التقدم', () => {
    expect(SUCCESSION).toMatch(/rpc\('succession_plan_create'/);
    expect(SUCCESSION).toMatch(/rpc\('succession_plan_board'/);
    expect(SUCCESSION_PAGE).toContain('خطة تطوير وتدريب');
    expect(SUCCESSION_PAGE).toContain('إنشاء وتكليف الدورة');
    expect(SUCCESSION_PAGE).toContain('تقدم الدورة');
  });
});

describe('0377 — مشغل تدريب الموظف والاختبار', () => {
  it('المشغل يرسل heartbeat كل 30 ثانية والباقي عند الإغلاق', () => {
    const code = codeOnly(TRAINING);
    expect(code).toMatch(/setInterval\([\s\S]{0,160}myTrainingService\.touch\(selectedCourse\.id, 30/);
    expect(code).toMatch(/remainder[\s\S]{0,120}myTrainingService\.touch\(selectedCourse\.id, remainder\)/);
  });

  it('الاختبار يُحمّل من SDK ويسلم عبر RPC service', () => {
    expect(TRAINING).toMatch(/quizService\.findByCourse/);
    expect(TRAINING).toMatch(/myTrainingService\.submitQuiz/);
    expect(TRAINING).toContain('تسليم الاختبار');
  });

  it('100% تكمل المحتوى بلا اختبار، والاختبار هو بوابة الإكمال إن وجد', () => {
    expect(M).toMatch(/v_complete := COALESCE\(p_progress,0\)>=100 AND NOT EXISTS/);
    expect(M).toMatch(/FROM public\.quizzes q[\s\S]{0,100}q\.is_active/);
    expect(M).toMatch(/completed=cp\.completed OR v_complete/);
  });
});
