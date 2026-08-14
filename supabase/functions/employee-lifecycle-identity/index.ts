import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  audit, CALLER_ROLES, enforceRateLimit, headers, isUuid, json, requireAdmin,
} from '../_shared/adminAuth.ts';
import { RATE_LIMITS } from '../_shared/rateLimit.ts';

const LIFECYCLE_ROLES = new Set([...CALLER_ROLES, 'hr']);

type IdentityAction = 'provision' | 'disable';
type IdentityStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface IdentityJob {
  id: string;
  tenant_id: string;
  employee_id: string;
  offboarding_id: string | null;
  action: IdentityAction;
  status: IdentityStatus;
  email: string | null;
  auth_user_id: string | null;
  attempt_count: number;
  started_at: string | null;
}

interface EmployeeRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name_ar: string | null;
  email: string | null;
  phone: string | null;
  department_id: string | null;
  position: string | null;
  is_active: boolean;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(req) });
  }
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req, LIFECYCLE_ROLES);
  if (context instanceof Response) return context;

  const limited = enforceRateLimit(
    req,
    context.caller.id,
    'employee-lifecycle-identity',
    RATE_LIMITS.ADMIN_CREATE,
  );
  if (limited) return limited;

  let jobId: string | null = null;
  try {
    const body = await req.json() as { job_id?: unknown };
    if (!isUuid(body.job_id)) return json(req, { error: 'job_id غير صالح' }, 400);
    jobId = body.job_id;

    const { data: rawJob, error: jobError } = await context.adminClient
      .from('employee_identity_jobs')
      .select('id,tenant_id,employee_id,offboarding_id,action,status,email,auth_user_id,attempt_count,started_at')
      .eq('id', jobId)
      .eq('tenant_id', context.callerProfile.tenant_id!)
      .maybeSingle();
    if (jobError || !rawJob) return json(req, { error: 'مهمة الهوية غير موجودة' }, 404);

    const job = rawJob as IdentityJob;
    if (job.status === 'completed') {
      return json(req, {
        success: true,
        idempotent: true,
        job_id: job.id,
        status: 'completed',
        auth_user_id: job.auth_user_id,
      });
    }
    if (job.status === 'cancelled') {
      return json(req, { error: 'مهمة الهوية ملغاة ولا يمكن تنفيذها' }, 409);
    }
    if (job.status === 'processing') {
      const startedAt = job.started_at ? new Date(job.started_at).getTime() : 0;
      const stale = !Number.isFinite(startedAt) || startedAt === 0
        || Date.now() - startedAt > 10 * 60_000;
      if (!stale) return json(req, { error: 'مهمة الهوية قيد التنفيذ بالفعل' }, 409);

      // استرداد claim عالق بعد انقطاع عامل سابق؛ لا تبقى processing للأبد.
      await context.adminClient
        .from('employee_identity_jobs')
        .update({ status: 'failed', last_error: 'استُعيدت مهمة processing عالقة', updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .eq('status', 'processing');
      job.status = 'failed';
    }

    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await context.adminClient
      .from('employee_identity_jobs')
      .update({
        status: 'processing',
        started_at: now,
        updated_at: now,
        last_error: null,
        attempt_count: Number(job.attempt_count || 0) + 1,
      })
      .eq('id', job.id)
      .in('status', ['pending', 'failed'])
      .select('id')
      .maybeSingle();
    if (claimError || !claimed) {
      return json(req, { error: 'تعذّر حجز مهمة الهوية؛ أعد تحميل الحالة' }, 409);
    }

    const fail = async (error: unknown): Promise<Response> => {
      const message = messageOf(error).slice(0, 2000);
      await context.adminClient
        .from('employee_identity_jobs')
        .update({ status: 'failed', last_error: message, updated_at: new Date().toISOString() })
        .eq('id', job.id)
        .eq('tenant_id', job.tenant_id);
      console.error('employee-lifecycle-identity failed:', message);
      return json(req, { error: message, job_id: job.id, status: 'failed' }, 500);
    };

    const { data: rawEmployee, error: employeeError } = await context.adminClient
      .from('employees')
      .select('id,tenant_id,user_id,first_name,last_name,full_name_ar,email,phone,department_id,position,is_active')
      .eq('id', job.employee_id)
      .eq('tenant_id', job.tenant_id)
      .maybeSingle();
    if (employeeError || !rawEmployee) return await fail('الموظف المرتبط بمهمة الهوية غير موجود');
    const employee = rawEmployee as EmployeeRow;

    if (job.action === 'provision') {
      if (!employee.is_active) return await fail('لا يمكن إنشاء حساب لموظف غير نشط');

      if (employee.user_id) {
        await context.adminClient
          .from('employee_identity_jobs')
          .update({
            status: 'completed',
            auth_user_id: employee.user_id,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null,
          })
          .eq('id', job.id);
        return json(req, {
          success: true,
          idempotent: true,
          job_id: job.id,
          status: 'completed',
          auth_user_id: employee.user_id,
        });
      }

      const email = String(job.email || employee.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return await fail('بريد الموظف غير صالح لإرسال الدعوة');
      }

      const fullName = String(
        employee.full_name_ar
        || `${employee.first_name || ''} ${employee.last_name || ''}`,
      ).trim() || 'موظف';
      const redirectTo = (Deno.env.get('APP_ORIGIN') || '')
        .split(',').map((value) => value.trim()).find(Boolean) || undefined;
      const { data: invited, error: inviteError } = await context.adminClient.auth.admin
        .inviteUserByEmail(email, {
          data: { full_name: fullName, role: 'employee', tenant_id: job.tenant_id },
          redirectTo,
        });
      if (inviteError || !invited.user) {
        return await fail(inviteError?.message || 'فشل إرسال دعوة الحساب');
      }

      const userId = invited.user.id;
      const rollbackAuth = async (): Promise<void> => {
        const { error } = await context.adminClient.auth.admin.deleteUser(userId);
        if (error) console.warn('identity compensation deleteUser failed:', error.message);
      };

      const { data: department } = employee.department_id
        ? await context.adminClient
          .from('departments')
          .select('name_ar')
          .eq('id', employee.department_id)
          .eq('tenant_id', job.tenant_id)
          .maybeSingle()
        : { data: null };

      const { error: profileError } = await context.adminClient
        .from('profiles')
        .upsert({
          id: userId,
          tenant_id: job.tenant_id,
          email,
          full_name: fullName,
          role: 'employee',
          department: department?.name_ar || null,
          position: employee.position || null,
          phone: employee.phone || null,
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      if (profileError) {
        await rollbackAuth();
        return await fail('فشل إنشاء ملف الحساب: ' + profileError.message);
      }

      const { data: linked, error: linkError } = await context.adminClient
        .from('employees')
        .update({ user_id: userId, email, updated_at: new Date().toISOString() })
        .eq('id', employee.id)
        .eq('tenant_id', job.tenant_id)
        .is('user_id', null)
        .select('id')
        .maybeSingle();
      if (linkError || !linked) {
        await rollbackAuth();
        return await fail('فشل ربط حساب Auth بسجل الموظف');
      }

      await context.adminClient
        .from('employee_identity_jobs')
        .update({
          status: 'completed',
          auth_user_id: userId,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', job.id);

      await audit(
        context.adminClient,
        job.tenant_id,
        context.caller.id,
        userId,
        'employee_identity_invited',
        { employee_id: employee.id, job_id: job.id, email },
      );

      return json(req, {
        success: true,
        job_id: job.id,
        status: 'completed',
        auth_user_id: userId,
        invitation_sent: true,
      }, 201);
    }

    // action = disable
    const userId = employee.user_id || job.auth_user_id;
    if (userId === context.caller.id) return await fail('لا يمكن تعطيل حسابك الحالي');

    let orphanAuth = false;
    if (userId) {
      const { error: authError } = await context.adminClient.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
      });
      if (authError) {
        const lower = authError.message.toLowerCase();
        orphanAuth = lower.includes('not found') || lower.includes('user not found');
        if (!orphanAuth) return await fail('فشل تعطيل Auth: ' + authError.message);
      }

      const { error: profileError } = await context.adminClient
        .from('profiles')
        .update({ status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', userId)
        .eq('tenant_id', job.tenant_id);
      if (profileError) return await fail('فشل تعطيل ملف المستخدم: ' + profileError.message);
    }

    if (job.offboarding_id) {
      const { error: checklistError } = await context.adminClient
        .from('offboarding_records')
        .update({ access_revoked: true, updated_at: new Date().toISOString() })
        .eq('id', job.offboarding_id)
        .eq('tenant_id', job.tenant_id);
      if (checklistError) {
        return await fail('عُطّل Auth لكن تعذّر تحديث سجل سحب الصلاحيات: ' + checklistError.message);
      }
    }

    await context.adminClient
      .from('employee_identity_jobs')
      .update({
        status: 'completed',
        auth_user_id: userId || null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: orphanAuth ? 'Auth user غير موجود؛ عُطّل profile إن وُجد' : null,
      })
      .eq('id', job.id);

    await audit(
      context.adminClient,
      job.tenant_id,
      context.caller.id,
      userId || employee.id,
      'employee_identity_disabled',
      { employee_id: employee.id, job_id: job.id, orphan_auth: orphanAuth },
    );

    return json(req, {
      success: true,
      job_id: job.id,
      status: 'completed',
      auth_user_id: userId || null,
      orphan_auth: orphanAuth,
    });
  } catch (error) {
    const message = messageOf(error);
    console.error('employee-lifecycle-identity unexpected:', message);
    if (jobId) {
      // Best effort فقط؛ قد يفشل قبل الحصول على سياق المهمة.
      await context.adminClient
        .from('employee_identity_jobs')
        .update({ status: 'failed', last_error: message.slice(0, 2000), updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('tenant_id', context.callerProfile.tenant_id!);
    }
    return json(req, { error: 'خطأ داخلي في دورة الهوية' }, 500);
  }
});
