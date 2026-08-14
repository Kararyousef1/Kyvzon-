/** عقد 0378 وواجهات التكامل المتوسطة للمرحلة الخامسة. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const M = read('supabase/migrations/0378_phase5_operational_interfaces.sql');
const PERM_SVC = read('src/services/sdk/PermissionRequestGatewayService.ts');
const PERM_PAGE = read('src/pages/employee/PermissionsPage.tsx');
const SOP_PAGE = read('src/pages/admin/AdminSOPsReport.tsx');
const ATTENDANCE = read('src/pages/hr/AttendancePage.tsx');
const MOVEMENT = read('src/pages/hr/HRMovementAnalyticsPage.tsx');
const TRAINING = read('src/pages/employee/TrainingPage.tsx');

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('0378 — تنفيذ الزمنيات', () => {
  it('يربط سجل التنفيذ بطلبه داخل tenant وRESTRICT', () => {
    expect(M).toMatch(/FOREIGN KEY \(source_request_id,tenant_id\)[\s\S]{0,100}REFERENCES public\.permissions_request\(id,tenant_id\) ON DELETE RESTRICT/);
    expect(M).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_permissions_source_request/);
  });

  it('حارس الأوقات الفعلية يمنع العودة قبل الخروج', () => {
    expect(M).toMatch(/actual_return_time>actual_out_time/);
    expect(M).toContain('PERMISSION_ACTUAL_TIMES_INVALID');
    expect(M).toContain('PERMISSION_ACTUAL_RETURN_REQUIRED');
  });

  it('RPC staff-only وتشتق سجل التنفيذ من الطلب المعتمد', () => {
    const body = M.slice(M.indexOf('CREATE FUNCTION public.permission_execution_record'), M.indexOf('REVOKE ALL ON FUNCTION public.permission_execution_record'));
    expect(body).toMatch(/current_user_is_staff\(\)/);
    expect(body).toMatch(/v_request\.status<>'موافق'/);
    expect(body).toMatch(/execution_recorded_by=auth\.uid\(\)/);
  });

  it('الخدمة والواجهة لا تكتبان جدول permissions مباشرة', () => {
    expect(PERM_SVC).toMatch(/rpc\('permission_execution_record'/);
    expect(PERM_PAGE).toContain('تسجيل التنفيذ الفعلي');
    expect(PERM_PAGE).toContain('الخروج الفعلي');
    expect(PERM_PAGE).toContain('العودة الفعلية');
    expect(codeOnly(PERM_PAGE)).not.toMatch(/\.from\(['"]permissions['"]\)/);
  });
});

describe('واجهات التكامل المتوسطة', () => {
  it('تقرير SOP يستخدم sop_compliance_overview عبر الخدمة القائمة', () => {
    expect(SOP_PAGE).toMatch(/sopService\.compliance\(\)/);
    expect(SOP_PAGE).toContain('امتثال الإجراءات');
    expect(SOP_PAGE).toContain('approvedCount');
  });

  it('صفحة حضور HR تعرض biometric_devices_health عبر SDK', () => {
    expect(ATTENDANCE).toMatch(/techMetricsService\.devicesHealth\(\)/);
    expect(ATTENDANCE).toContain('صحة أجهزة البصمة');
    expect(ATTENDANCE).toContain('بصمة اليوم');
  });

  it('بوابة HR توفر إنشاء تصريح عبر بوابة الحركة الحقيقية', () => {
    expect(MOVEMENT).toContain('/app/movement/employee/permits/new');
    expect(MOVEMENT).toContain('تصريح حركة جديد');
  });

  it('تدريب الموظف لديه مشغل heartbeat وشاشة اختبار', () => {
    expect(TRAINING).toContain('مشغل المحتوى التدريبي');
    expect(TRAINING).toMatch(/myTrainingService\.touch/);
    expect(TRAINING).toMatch(/myTrainingService\.submitQuiz/);
    expect(TRAINING).toContain('تسليم الاختبار');
  });
});
