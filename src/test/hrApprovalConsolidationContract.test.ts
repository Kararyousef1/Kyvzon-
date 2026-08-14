/**
 * عقد 0375 — توحيد مستهلكي HR ومصالحة الطلبات اليتيمة.
 *
 * فحص ثابت يمنع رجوع React إلى الجدولين القديمين ويثبت أن المصالحة تحفظ
 * التاريخ، تغلق الحي فقط، وتحرس المصدر متعدد الأشكال وصندوق الوارد.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const M = read('supabase/migrations/0375_hr_approval_orphan_reconciliation.sql');
const INDEX = read('src/services/sdk/index.ts');
const UNIFIED = read('src/services/sdk/UnifiedApprovalService.ts');
const INBOX = read('src/shared/components/dashboard/HrApprovalInbox.tsx');
const LEAVE = read('src/pages/employee/LeaveRequestPage.tsx');
const PERMISSION = read('src/pages/employee/PermissionsPage.tsx');
const REPORT = read('docs/HR_APPROVAL_ENGINE_CONSOLIDATION_0375.md');

function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*--.*$/gm, '');
}

function sourceFiles(dir: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !path.includes('/test/')) result.push(path);
  }
  return result;
}

describe('0375 — حارس المصدر متعدد الأشكال', () => {
  it.each([
    ['leave', 'public.leaves'],
    ['permission', 'public.permissions_request'],
    ['expense', 'public.expense_requests'],
    ['loan', 'public.employee_loans'],
  ])('يربط %s بمصدره %s داخل المستأجر', (kind, table) => {
    const body = M.slice(
      M.indexOf('CREATE FUNCTION public.hr_approval_source_exists'),
      M.indexOf('COMMENT ON FUNCTION public.hr_approval_source_exists'),
    );
    expect(body).toContain(`WHEN '${kind}'`);
    expect(body).toContain(`FROM ${table}`);
    expect(body).toMatch(/x\.tenant_id = p_tenant_id/);
  });

  it('يحرس INSERT وتغيير مفاتيح المرجع قبل الكتابة', () => {
    expect(M).toMatch(/CREATE TRIGGER trg_guard_hr_approval_source[\s\S]{0,160}BEFORE INSERT OR UPDATE OF request_type, related_id, tenant_id/);
    expect(M).toMatch(/HR_APPROVAL_SOURCE_NOT_FOUND/);
    expect(M).toMatch(/ERRCODE = 'foreign_key_violation'/);
  });

  it('إغلاق حذف المصدر يغطي الجداول الأربعة', () => {
    for (const table of ['leaves', 'permissions_request', 'expense_requests', 'employee_loans']) {
      expect(M).toMatch(new RegExp(`BEFORE DELETE ON public\\.${table}`));
    }
  });
});

describe('0375 — المصالحة تحفظ التاريخ وتغلق الحي', () => {
  it('يسجّل اليتيم قبل بدء تحديثات المصالحة', () => {
    const audit = M.indexOf("'source_missing'");
    const close = M.indexOf('UPDATE public.hr_approval_steps s', audit);
    expect(audit).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(audit);
  });

  it('لا يحذف الطلبات أو الخطوات أو المرآة', () => {
    const code = codeOnly(M);
    expect(code).not.toMatch(/DELETE FROM public\.hr_approval_(requests|steps)/);
    expect(code).not.toMatch(/DELETE FROM public\.unified_approval_steps/);
    expect(code).not.toMatch(/DROP TABLE[^;]*hr_approval_(requests|steps)/);
  });

  it('يغلق الخطوات الحية فقط ويحوّل الطلب المعلّق إلى rejected', () => {
    expect(M).toMatch(/s\.status IN \('pending','active'\)/);
    expect(M).toMatch(/SET status = 'skipped'/);
    expect(M).toMatch(/UPDATE public\.hr_approval_requests r[\s\S]{0,180}SET status = 'rejected'/);
    expect(M).toMatch(/r\.status = 'pending'/);
    expect(M).toContain("ELSE 'historical_preserved'");
  });

  it('صندوق الوارد يفرض وجود المصدر دفاعاً في العمق', () => {
    const wrapper = M.slice(M.indexOf('CREATE FUNCTION public.my_approval_inbox('));
    expect(wrapper).toMatch(/my_approval_inbox_pre_0375\(p_unit_key\)/);
    expect(wrapper).toMatch(/out_source_module NOT IN \('hr','employee_finance'\)/);
    expect(wrapper).toMatch(/hr_approval_source_exists\(/);
  });

  it('تقرير التدقيق مقيد بالمستأجر وبالموظفين المخولين', () => {
    const audit = M.slice(M.indexOf('CREATE FUNCTION public.hr_approval_orphan_audit'));
    expect(audit).toMatch(/r\.tenant_id = v_tenant/);
    expect(audit).toMatch(/current_user_is_staff\(\)/);
    expect(audit).toMatch(/status IN \('pending','active'\)/);
  });
});

describe('0375 — واجهة React على المحرّك الموحّد فقط', () => {
  it('حُذفت خدمة HR القديمة وتصديرها', () => {
    expect(existsSync(resolve(root, 'src/services/sdk/HrApprovalService.ts'))).toBe(false);
    expect(INDEX).not.toMatch(/HrApprovalService|hrApprovalService/);
    expect(INDEX).toMatch(/UnifiedApprovalService/);
  });

  it('صندوق اللوحة يستخدم inbox والقرار الموحدين بلا إثراء من جداول المصدر', () => {
    const code = codeOnly(INBOX);
    expect(code).toMatch(/unifiedApprovalService\.findMyInbox\(\)/);
    expect(code).toMatch(/unifiedApprovalService\.decide\(/);
    expect(code).not.toMatch(/hrApprovalService|leaveService|permissionRequestService/);
  });

  it('صفحتا الإجازة والاستئذان تقرران بمعرّف المصدر عبر الواجهة الموحدة', () => {
    for (const page of [LEAVE, PERMISSION]) {
      const code = codeOnly(page);
      expect(code).toMatch(/unifiedApprovalService\.decideHrAny\(row\.id/);
      expect(code).not.toMatch(/hrApprovalService|findRequestIdBySource/);
    }
  });

  it('لا يوجد وصول إنتاجي مباشر من src إلى جدولي HR القديمين', () => {
    const direct = /\.from\(\s*['"]hr_approval_(?:requests|steps)['"]\s*\)/;
    const offenders = sourceFiles(resolve(root, 'src'))
      .filter((path) => direct.test(codeOnly(readFileSync(path, 'utf8'))))
      .map((path) => path.replace(`${root}/`, ''));
    expect(offenders).toEqual([]);
  });

  it('نوع وحدة مالية الموظف ممثل في TypeScript والتسميات', () => {
    expect(UNIFIED).toMatch(/\| 'employee_finance'/);
    expect(UNIFIED).toMatch(/employee_finance: 'طلبات الموظف المالية'/);
    expect(UNIFIED).toMatch(/employee_finance: 'bg-fuchsia-100 text-fuchsia-700'/);
  });
});

describe('0375 — قرار حذف الجدول القديم موثق ومدعوم بالتبعيات', () => {
  it('التقرير يمنع الحذف الآن ويسمي آخر القراء والكتّاب', () => {
    expect(REPORT).toContain('القرار: لا يُحذف الآن');
    for (const dependency of [
      'create_hr_approval',
      'decide_hr_approval_step',
      'sync_hr_source_status',
      'can_use_request_scope',
      'my_approval_inbox_pre_0375',
      'mirror_hr_step_to_unified',
    ]) {
      expect(REPORT).toContain(dependency);
    }
  });
});
