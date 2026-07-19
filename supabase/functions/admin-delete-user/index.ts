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

    // ─── محاولة حذف المستخدم من auth.users ────────────────────────────────
    const { error: authDeleteError } = await context.adminClient.auth.admin.deleteUser(targetId);

    if (authDeleteError) {
      const msg = authDeleteError.message.toLowerCase();

      const isOrphan = msg.includes('user not found') || msg.includes('not found');

      // "Database error loading user" = مستخدم موجود في auth.users
      // لكن سجله مكسور/ناقص (أُنشئ بدون auth flow صحيح أو حُذف جزئياً)
      // الحل: نحذف profile مباشرة لأن auth لا يمكنه تحميله أصلاً
      const isCorrupt = msg.includes('database error loading user') ||
                        msg.includes('error loading user') ||
                        msg.includes('database error');

      if (isOrphan || isCorrupt) {
        const reason = isOrphan ? 'orphan_no_auth_user' : 'corrupt_auth_record';
        console.warn(`admin-delete-user: ${reason} for ${targetId}, deleting profile directly`);

        // حذف employees أولاً لأنه يشير إلى profiles
        await context.adminClient
          .from('employees')
          .update({ user_id: null })
          .eq('user_id', targetId)
          .eq('tenant_id', context.callerProfile.tenant_id);

        // ثم حذف profile
        const { error: profileDeleteError } = await context.adminClient
          .from('profiles')
          .delete()
          .eq('id', targetId);

        if (profileDeleteError) {
          console.error('admin-delete-user: profile delete failed:', profileDeleteError.message);
          return json(req, { error: 'فشل حذف ملف المستخدم' }, 500);
        }

        // إذا كان الخطأ "loading" وليس "not found" → نحاول حذف auth أيضاً عبر SQL مباشر
        if (isCorrupt) {
          try {
            await context.adminClient.rpc('delete_auth_user_direct', { p_user_id: targetId });
          } catch {
            // نتجاهل — قد لا تكون الـ RPC موجودة، والـ profile حُذف بالفعل
          }
        }

        await audit(
          context.adminClient,
          context.callerProfile.tenant_id!,
          context.caller.id,
          targetId,
          'admin_delete_profile_direct',
          {
            reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
            auth_error: reason,
            note: authDeleteError.message,
          },
        );

        return json(req, { success: true, method: reason }, 200);
      }

      // خطأ حقيقي غير متوقع
      console.error('admin-delete-user: auth.admin.deleteUser failed:', authDeleteError.message);
      return json(req, { error: 'فشل حذف المستخدم: ' + authDeleteError.message }, 500);
    }

    // ─── حذف ناجح من auth (cascade يحذف profile تلقائياً) ─────────────────
    await audit(
      context.adminClient,
      context.callerProfile.tenant_id!,
      context.caller.id,
      targetId,
      'admin_delete_user',
      {
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : null,
      },
    );

    return json(req, { success: true, method: 'auth_delete' }, 200);

  } catch (error) {
    console.error('admin-delete-user error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});