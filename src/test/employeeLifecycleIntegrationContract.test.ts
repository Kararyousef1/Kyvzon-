/** عقد 0376 — Hire→Auth→Contract وOffboarding→Contract→Auth. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const M = read('supabase/migrations/0376_employee_lifecycle_hire_auth_contract.sql');
const EDGE = read('supabase/functions/employee-lifecycle-identity/index.ts');
const AUTH = read('supabase/functions/_shared/adminAuth.ts');
const IDENTITY = read('src/services/sdk/EmployeeIdentityService.ts');
const RECRUIT = read('src/services/sdk/RecruitmentPipelineService.ts');
const RECRUIT_PAGE = read('src/pages/hr/RecruitmentPage.tsx');
const ONBOARD = read('src/services/sdk/OnboardingLifecycleService.ts');
const ONBOARD_PAGE = read('src/pages/hr/OnboardingPage.tsx');
const SUPABASE_CONFIG = read('supabase/config.toml');

function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

describe('0376 — الروابط القانونية', () => {
  it('يربط العقد بطلب التوظيف وإنهاء الخدمة مع tenant', () => {
    expect(M).toMatch(/FOREIGN KEY \(job_application_id, tenant_id\)[\s\S]{0,100}REFERENCES public\.job_applications\(id, tenant_id\) ON DELETE RESTRICT/);
    expect(M).toMatch(/FOREIGN KEY \(offboarding_id, tenant_id\)[\s\S]{0,100}REFERENCES public\.offboarding_records\(id, tenant_id\) ON DELETE RESTRICT/);
  });

  it('طلب التوظيف ينتج عقداً واحداً فقط', () => {
    expect(M).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_contract_job_application/);
    expect(M).toMatch(/ON public\.employee_contracts \(tenant_id, job_application_id\)/);
  });
});

describe('0376 — التوظيف ذري داخل DB', () => {
  const body = M.slice(
    M.indexOf('CREATE OR REPLACE FUNCTION public.tg_recruitment_hire_lifecycle'),
    M.indexOf('COMMENT ON FUNCTION public.tg_recruitment_hire_lifecycle'),
  );

  it('ينشئ draft contract مرتبطاً بالطلب', () => {
    expect(body).toMatch(/INSERT INTO public\.employee_contracts/);
    expect(body).toMatch(/'draft', NEW\.id/);
  });

  it('يسجل provision outbox ولا يحاول Auth من SQL', () => {
    expect(body).toMatch(/INSERT INTO public\.employee_identity_jobs/);
    expect(body).toMatch(/'provision', 'pending'/);
    expect(codeOnly(M)).not.toMatch(/auth\.admin|inviteUserByEmail/);
  });

  it('يبدأ مهام التعريف المتاحة بلا N نداء من الواجهة', () => {
    expect(body).toMatch(/INSERT INTO public\.employee_onboarding/);
    expect(body).toMatch(/ON CONFLICT \(tenant_id, employee_id, task_id\) DO NOTHING/);
  });

  it('يعالج التوظيفات السابقة بـbackfill دون حذف', () => {
    expect(M).toMatch(/FROM public\.job_applications a[\s\S]{0,400}a\.status = 'hired'/);
    expect(codeOnly(M)).not.toMatch(/DELETE FROM public\.(job_applications|employees|employee_contracts)/);
  });
});

describe('0376 — إنهاء الخدمة يغلق دورة العقد والهوية', () => {
  const body = M.slice(
    M.indexOf('CREATE OR REPLACE FUNCTION public.tg_offboarding_lifecycle'),
    M.indexOf('COMMENT ON FUNCTION public.tg_offboarding_lifecycle'),
  );

  it('ينهي draft/active ويربط offboarding_id والسبب والتاريخ', () => {
    expect(body).toMatch(/UPDATE public\.employee_contracts/);
    expect(body).toMatch(/status = 'terminated'/);
    expect(body).toMatch(/offboarding_id = NEW\.id/);
    expect(body).toMatch(/termination_reason = btrim\(NEW\.reason\)/);
    expect(body).toMatch(/status IN \('draft','active'\)/);
  });

  it('يلغي دعوة لم تنفذ ويضيف disable outbox', () => {
    expect(body).toMatch(/action = 'provision'[\s\S]{0,100}status IN \('pending','failed'\)/);
    expect(body).toMatch(/'disable', 'pending'/);
  });

  it('يرفض آخر يوم يسبق بداية العقد', () => {
    expect(M).toMatch(/OFFBOARDING_BEFORE_CONTRACT_START/);
    expect(M).toMatch(/c\.start_date > NEW\.last_working_day/);
  });
});

describe('0376 — outbox محروسة وقابلة للرصد', () => {
  it('لا كتابة authenticated والقراءة staff داخل tenant', () => {
    expect(M).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.employee_identity_jobs FROM authenticated/);
    expect(M).toMatch(/tenant_id = public\.current_user_tenant_id\(\)[\s\S]{0,80}current_user_is_staff\(\)/);
  });

  it('تعرض pending/processing/completed/failed/cancelled', () => {
    for (const state of ['pending', 'processing', 'completed', 'failed', 'cancelled']) {
      expect(M).toContain(`'${state}'`);
    }
    expect(M).toMatch(/employee_identity_job_for_employee/);
  });

  it('قائمة المتقدمين تحمل حالة الدعوة والعقد بعد إعادة التحميل', () => {
    expect(M).toMatch(/out_identity_task_id UUID/);
    expect(M).toMatch(/out_identity_status TEXT/);
    expect(M).toMatch(/out_identity_error TEXT/);
    expect(M).toMatch(/out_contract_id UUID/);
  });
});

describe('0376 — Edge Function آمنة وقابلة للتعويض', () => {
  it('HR مسموح لها في الوظيفة المخصصة دون توسيع CALLER_ROLES العام', () => {
    expect(SUPABASE_CONFIG).toMatch(/\[functions\.employee-lifecycle-identity\]\s+verify_jwt = false/);
    expect(EDGE).toMatch(/LIFECYCLE_ROLES = new Set\(\[\.\.\.CALLER_ROLES, 'hr'\]\)/);
    expect(EDGE).toMatch(/requireAdmin\(req, LIFECYCLE_ROLES\)/);
    expect(AUTH).toMatch(/allowedRoles: ReadonlySet<string> = CALLER_ROLES/);
    expect(AUTH).toMatch(/!allowedRoles\.has\(String\(profile\.role\)\)/);
  });

  it('التوظيف يرسل invitation بلا كلمة مرور مؤقتة', () => {
    expect(EDGE).toMatch(/inviteUserByEmail\(email/);
    expect(codeOnly(EDGE)).not.toMatch(/createUser\(|password/);
  });

  it('يعوض فشل profile/employee بحذف Auth user', () => {
    expect(EDGE).toMatch(/rollbackAuth/);
    expect(EDGE).toMatch(/auth\.admin\.deleteUser\(userId\)/);
    expect((EDGE.match(/await rollbackAuth\(\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('إنهاء الخدمة يحظر Auth ويعطل profile ويغلق checklist', () => {
    expect(EDGE).toMatch(/ban_duration: '876000h'/);
    expect(EDGE).toMatch(/status: 'inactive'/);
    expect(EDGE).toMatch(/from\('offboarding_records'\)[\s\S]{0,100}access_revoked: true/);
  });

  it('claim ذري يمنع عاملين ويسترد processing العالق', () => {
    expect(EDGE).toMatch(/\.in\('status', \['pending', 'failed'\]\)/);
    expect(EDGE).toMatch(/status: 'processing'/);
    expect(EDGE).toMatch(/10 \* 60_000/);
    expect(EDGE).toContain('استُعيدت مهمة processing عالقة');
  });
});

describe('0376 — SDK والواجهات', () => {
  it('الخدمة لا تكتب outbox مباشرة: RPC قراءة + Edge تنفيذ', () => {
    const code = codeOnly(IDENTITY);
    expect(code).toMatch(/rpc\('employee_identity_job_for_employee'/);
    expect(code).toMatch(/functions\.invoke\('employee-lifecycle-identity'/);
    expect(code).not.toMatch(/\.from\(['"]employee_identity_jobs/);
  });

  it('hire لا يرمي بعد نجاح DB إذا فشلت الدعوة', () => {
    const body = RECRUIT.slice(RECRUIT.indexOf('async hire('));
    expect(body).toMatch(/let identity = await this\.identityJob/);
    expect(body).toMatch(/catch \(edgeError\)/);
    expect(body).toMatch(/identityError/);
  });

  it('واجهة التوظيف تعرض مسودة العقد وحالة الدعوة وزر retry', () => {
    expect(RECRUIT_PAGE).toContain('مسودة عقد جاهزة');
    expect(RECRUIT_PAGE).toContain('دعوة الحساب أُرسلت');
    expect(RECRUIT_PAGE).toMatch(/recruitmentSdk\.runIdentityJob/);
  });

  it('offboarding ينفذ disable outbox ويعرض الفشل القابل لإعادة المحاولة', () => {
    expect(ONBOARD).toMatch(/findForEmployee\(input\.employeeId, 'disable'\)/);
    expect(ONBOARD).toMatch(/employeeIdentityService\.run/);
    expect(M).toMatch(/out_closed_contracts INTEGER/);
    expect(M).toMatch(/out_identity_task_id UUID/);
    expect(ONBOARD_PAGE).toContain('أُغلق العقد');
    expect(ONBOARD_PAGE).toContain('تعطيل الحساب محفوظ لإعادة المحاولة');
    expect(ONBOARD_PAGE).toContain('إعادة محاولة تعطيل الحساب');
    expect(ONBOARD_PAGE).toMatch(/onboardingLifecycleSdk\.runIdentityJob/);
  });
});
