import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { audit, enforceRateLimit, headers, isUuid, json, requireAdmin, targetInCallerTenant } from '../_shared/adminAuth.ts';
import { RATE_LIMITS } from '../_shared/rateLimit.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;

  const rl = enforceRateLimit(req, context.caller.id, 'admin-delete-user', RATE_LIMITS.ADMIN_DELETE);
  if (rl) return rl;

  try {
    const body = await req.json() as { target_user_id?: unknown; reason?: unknown };
    const targetId = body.target_user_id;
    if (!isUuid(targetId)) return json(req, { error: 'target_user_id غير صالح' }, 400);
    if (targetId === context.caller.id) return json(req, { error: 'لا يمكن حذف المستخدم الحالي' }, 400);

    const target = await targetInCallerTenant(
      context.adminClient,
      targetId,
      context.callerProfile.tenant_id!,
    );
    if (target.error || !target.profile) return json(req, { error: 'المستخدم غير موجود في الشركة' }, 404);

    const { error } = await context.adminClient.auth.admin.deleteUser(targetId);
    if (error) {
      console.error('admin-delete-user failed:', error.message);
      return json(req, { error: 'فشل حذف المستخدم' }, 500);
    }

    await audit(context.adminClient, context.callerProfile.tenant_id!, context.caller.id, targetId, 'admin_delete_user', {
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
    });
    return json(req, { success: true }, 200);
  } catch (error) {
    console.error('admin-delete-user error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});
