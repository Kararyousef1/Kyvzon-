import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { audit, headers, isUuid, json, requireAdmin, targetInCallerTenant } from '../_shared/adminAuth.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;

  try {
    const body = await req.json() as { target_user_id?: unknown; new_password?: unknown };
    const targetId = body.target_user_id;
    const newPassword = String(body.new_password || '');
    if (!isUuid(targetId) || newPassword.length < 8 || newPassword.length > 128) {
      return json(req, { error: 'البيانات غير صالحة' }, 400);
    }

    const target = await targetInCallerTenant(context.adminClient, targetId, context.callerProfile.tenant_id!);
    if (target.error || !target.profile) return json(req, { error: 'المستخدم غير موجود في الشركة' }, 404);

    const { error } = await context.adminClient.auth.admin.updateUserById(targetId, { password: newPassword });
    if (error) {
      console.error('admin-reset-password failed:', error.message);
      return json(req, { error: 'فشل إعادة تعيين كلمة المرور' }, 500);
    }

    await audit(context.adminClient, context.callerProfile.tenant_id!, context.caller.id, targetId, 'admin_reset_password');
    return json(req, { success: true }, 200);
  } catch (error) {
    console.error('admin-reset-password error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});
