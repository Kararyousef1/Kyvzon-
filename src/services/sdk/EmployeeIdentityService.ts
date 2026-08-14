/**
 * EmployeeIdentityService — حدّ SDK لدورة Auth غير الذرية مع PostgreSQL.
 *
 * DB تسجل outbox أولاً؛ Edge Function وحدها تملك service role وتنفذ
 * invitation/disable. المتصفح لا يكتب employee_identity_jobs مباشرةً.
 */
import { supabase } from '../supabase/supabase';
import { SdkError } from './BaseService';

export type IdentityJobAction = 'provision' | 'disable';
export type IdentityJobStatus =
  | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface EmployeeIdentityJob {
  id: string;
  action: IdentityJobAction;
  status: IdentityJobStatus;
  authUserId: string | null;
  attemptCount: number;
  lastError: string | null;
  updatedAt: string | null;
  contractId: string | null;
}

type Raw = Record<string, unknown>;

const nullable = (value: unknown): string | null =>
  value == null || String(value) === '' ? null : String(value);

async function edgeErrorMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== 'object') return 'تعذّر تنفيذ دورة حساب الموظف';
  const value = error as {
    message?: string;
    context?: { json?: () => Promise<{ error?: string }> };
  };
  try {
    const body = await value.context?.json?.();
    if (body?.error) return body.error;
  } catch {
    // نستخدم رسالة SDK إن تعذّر تحليل جسم Edge Function.
  }
  return value.message || 'تعذّر تنفيذ دورة حساب الموظف';
}

class EmployeeIdentityService {
  async findForEmployee(
    employeeId: string,
    action?: IdentityJobAction,
  ): Promise<EmployeeIdentityJob | null> {
    const { data, error } = await supabase.rpc('employee_identity_job_for_employee', {
      p_employee: employeeId,
      p_action: action ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    const row = ((data ?? []) as Raw[])[0];
    if (!row) return null;
    return {
      id: String(row.out_id),
      action: String(row.out_action) as IdentityJobAction,
      status: String(row.out_status) as IdentityJobStatus,
      authUserId: nullable(row.out_auth_user_id),
      attemptCount: Number(row.out_attempt_count ?? 0),
      lastError: nullable(row.out_last_error),
      updatedAt: nullable(row.out_updated_at),
      contractId: nullable(row.out_contract_id),
    };
  }

  async run(jobId: string): Promise<IdentityJobStatus> {
    const { data, error } = await supabase.functions.invoke('employee-lifecycle-identity', {
      body: { job_id: jobId },
    });
    if (error) throw new Error(await edgeErrorMessage(error));
    const result = (data ?? {}) as Record<string, unknown>;
    return String(result.status || 'completed') as IdentityJobStatus;
  }
}

export const employeeIdentityService = new EmployeeIdentityService();
