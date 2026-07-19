import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { audit, enforceRateLimit, headers, isUuid, json, requireAdmin, targetInCallerTenant } from '../_shared/adminAuth.ts';
import { RATE_LIMITS } from '../_shared/rateLimit.ts';

// ─── Password complexity (مطابق لـ admin-create-user) ───────────────────────
function isValidPassword(pw: string): boolean {
  if (pw.length < 8 || pw.length > 128) return false;
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  return hasUpper && hasLower && hasDigit;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;

  const rl = enforceRateLimit(req, context.caller.id, 'admin-reset-password', RATE_LIMITS.ADMIN_RESET_PW);
  if (rl) return rl;

  try {
    const body = await req.json() as { target_user_id?: unknown; new_password?: unknown };
    const targetId = body.target_user_id;
    const newPassword = String(body.new_password || '');

    if (!isUuid(targetId)) {
      return json(req, { error: 'target_user_id غير صالح' }, 400);
    }
    if (!isValidPassword(newPassword)) {
      return json(req, { error: 'كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل وتشمل أحرفاً كبيرة وصغيرة وأرقاماً' }, 400);
    }

    // ─── التحقق من وجود المستخدم في نفس الشركة ──────────────────────────
    const target = await targetInCallerTenant(context.adminClient, targetId, context.callerProfile.tenant_id!);
    if (target.error || !target.profile) {
      return json(req, { error: 'المستخدم غير موجود في الشركة' }, 404);
    }

    // ─── محاولة تحديث كلمة المرور في auth ──────────────────────────────────
    const { error: authError } = await context.adminClient.auth.admin.updateUserById(targetId, {
      password: newPassword,
    });

    if (authError) {
      const isOrphan =
        authError.message.toLowerCase().includes('user not found') ||
        authError.message.toLowerCase().includes('not found');

      if (isOrphan) {
        // المستخدم يتيم — موجود في profiles لكن لا auth user له
        // لا يمكن تعيين كلمة مرور لمستخدم بدون auth account
        console.warn(`admin-reset-password: orphan profile detected for ${targetId} — no auth user to update`);
        return json(req, { error: 'هذا المستخدم لا يملك حساب مصادقة نشط. أنشئ حساباً جديداً له.' }, 422);
      }

      console.error('admin-reset-password failed:', authError.message);
      return json(req, { error: 'فشل إعادة تعيين كلمة المرور' }, 500);
    }

    await audit(
      context.adminClient,
      context.callerProfile.tenant_id!,
      context.caller.id,
      targetId,
      'admin_reset_password',
    );

    return json(req, { success: true }, 200);

  } catch (error) {
    console.error('admin-reset-password error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});