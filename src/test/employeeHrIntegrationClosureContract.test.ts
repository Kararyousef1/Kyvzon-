import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const strip = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const migration = read('supabase/migrations/0374_employee_hr_integration_closure.sql');
const migrationCode = migration.replace(/^\s*--.*$/gm, '');
const selfService = strip(read('src/services/sdk/EmployeeSelfServiceService.ts'));
const contactPage = strip(read('src/pages/employee/ContactPage.tsx'));
const wellnessService = strip(read('src/services/sdk/WellnessService.ts'));
const wellnessPage = strip(read('src/pages/employee/WellnessPage.tsx'));
const sdkTypes = strip(read('src/shared/types/sdk.ts'));
const sdkIndex = strip(read('src/services/sdk/index.ts'));

function functionBody(name: string): string {
  const match = migrationCode.match(new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
    'm',
  ));
  expect(match, `${name} غير موجودة`).toBeTruthy();
  return (match as RegExpMatchArray)[0];
}

describe('0374 — إنشاء طلب HR ذري', () => {
  it('ينشئ الحالة والرسالة داخل دالة واحدة', () => {
    const body = functionBody('employee_hr_case_submit');
    expect(body).toContain('public.hr_case_open(');
    expect(body).toContain('INSERT INTO public.hr_messages');
    expect(body).toContain('case_id');
    expect(body).toContain('RETURN QUERY SELECT v_case_id, v_message_id');
  });

  it('لا يستقبل tenant_id أو employee_id من المتصفح', () => {
    const signature = migrationCode.match(
      /CREATE FUNCTION public\.employee_hr_case_submit\([\s\S]*?\)\s*RETURNS TABLE/,
    )?.[0] ?? '';
    expect(signature).not.toContain('p_tenant');
    expect(signature).not.toContain('p_employee');
    const body = functionBody('employee_hr_case_submit');
    expect(body).toContain('current_user_tenant_id()');
    expect(body).toContain('current_user_employee_id()');
  });

  it('يحرس المصادقة والاشتراك والمدخلات', () => {
    const body = functionBody('employee_hr_case_submit');
    expect(body).toContain('auth.uid() IS NULL');
    expect(body).toContain("hybrid_allows_module('hr')");
    expect(body).toContain('HR_CASE_TEXT_REQUIRED');
    expect(body).toContain('HR_CASE_BAD_PRIORITY');
  });

  it('محجوب عن PUBLIC وanon وممنوح للمصادق', () => {
    const signature = 'public.employee_hr_case_submit(TEXT,TEXT,TEXT,TEXT)';
    expect(migrationCode).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
    expect(migrationCode).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
    expect(migrationCode).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated`);
  });

  it('ContactPage تستدعي المسار الذري ولا تكتب نسختين', () => {
    expect(contactPage).toContain('hrCaseService.submitCase(');
    expect(contactPage).not.toContain('messageService');
    expect(contactPage).not.toContain('hrCaseService.createCase(');
    expect(selfService).toContain("supabase.rpc('employee_hr_case_submit'");
  });
});

describe('0374 — الرد يصل فعلياً إلى الموظف', () => {
  it('رد صندوق HR يضيف تعليقاً عاماً للحالة المرتبطة', () => {
    const body = functionBody('hr_message_reply');
    expect(body).toContain('INSERT INTO public.hr_case_comments');
    expect(body).toContain('public.current_user_role()');
    expect(body).toContain('false');
    expect(body).toContain('tenant_id = v_tenant');
  });

  it('التعليقات append-only: لا تعديل ولا حذف', () => {
    expect(migrationCode).toContain('REVOKE UPDATE, DELETE ON public.hr_case_comments FROM authenticated');
    expect(migrationCode).toContain('trg_block_hr_case_comment_mutation');
    expect(migrationCode).toContain('HR_CASE_COMMENT_IMMUTABLE');
    expect(migrationCode).toMatch(/CREATE POLICY kyvzon_hr_case_comments_insert[\s\S]*?FOR INSERT/);
  });

  it('ContactPage تقرأ آخر رد عام وتعرضه', () => {
    expect(contactPage).toContain('hrCaseCommentService.findByCase(');
    expect(contactPage).toContain('latestReplies[item.id].message');
    expect(contactPage).toContain('آخر رد من الموارد البشرية');
  });

  it('الخدمة القديمة MessageService أزيلت من الحزمة', () => {
    expect(sdkIndex).not.toContain('MessageService');
    expect(sdkIndex).not.toContain('messageService');
  });
});

describe('0374 — توحيد مخطط العافية', () => {
  it('نوع SDK يطابق الأعمدة الحقيقية', () => {
    const body = sdkTypes.slice(
      sdkTypes.indexOf('export interface WellnessEntryRecord'),
      sdkTypes.indexOf('export interface SurveyResponseRecord'),
    );
    for (const field of ['score:', 'mood:', 'stress:', 'energy:']) {
      expect(body).toContain(field);
    }
    expect(body).not.toContain('mood_score');
    expect(body).not.toContain('stress_level');
    expect(body).not.toContain('energy_level');
  });

  it('الخدمة تحسب المتوسط والاتجاه من score', () => {
    expect(wellnessService).toContain('entry.score');
    expect(wellnessService).not.toContain('.mood_score');
    expect(wellnessService).not.toContain('.stress_level');
    expect(wellnessService).not.toContain('.energy_level');
  });

  it('الحفظ يحدّث صف اليوم بدلاً من الاصطدام بالقيد الفريد', () => {
    expect(wellnessService).toContain('filters: { employee_id: employeeId, date: input.date }');
    expect(wellnessService).toContain('return this.update(existing[0].id, payload)');
    expect(wellnessService).toContain('return this.create(payload)');
  });

  it('صفحة العافية تستخدم employees.id لا profiles.id', () => {
    expect(wellnessPage).toContain('useEmployeeId()');
    expect(wellnessPage).toContain('findByEmployee(employeeId, 7)');
    expect(wellnessPage).toContain('saveEntry(employeeId,');
    expect(wellnessPage).not.toContain('useAuthStore');
  });

  it('أزيلت خدمة wellness المكررة وبقي مصدر واحد', () => {
    expect(wellnessService).toContain('export const wellnessEntryService');
    expect(wellnessService).not.toContain('export const wellnessService');
    expect(sdkIndex).not.toContain('wellnessService');
  });
});
