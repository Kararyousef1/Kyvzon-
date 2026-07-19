import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { audit, enforceRateLimit, headers, isUuid, json, requireAdmin, targetInCallerTenant } from '../_shared/adminAuth.ts';
import { RATE_LIMITS } from '../_shared/rateLimit.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;

  const rl = enforceRateLimit(req, context.caller.id, 'admin-toggle-status', RATE_LIMITS.ADMIN_TOGGLE);
  if (rl) return rl;

  try {
    const body = await req.json() as { target_user_id?: unknown; disabled?: unknown };
    const targetId = body.target_user_id;
    const disabled = body.disabled === true;

    if (!isUuid(targetId)) return json(req, { error: 'target_user_id غير صالح' }, 400);
    if (targetId === context.caller.id) return json(req, { error: 'لا يمكن تعطيل المستخدم الحالي' }, 400);

    // ─── التحقق من وجود المستخدم في نفس الشركة ──────────────────────────
    const target = await targetInCallerTenant(context.adminClient, targetId, context.callerProfile.tenant_id!);
    if (target.error || !target.profile) {
      return json(req, { error: 'المستخدم غير موجود في الشركة' }, 404);
    }

    // ─── محاولة تحديث حالة auth user ────────────────────────────────────────
    const { error: authError } = await context.adminClient.auth.admin.updateUserById(targetId, {
      ban_duration: disabled ? '876000h' : 'none',
    });

    if (authError) {
      const isOrphan =
        authError.message.toLowerCase().includes('user not found') ||
        authError.message.toLowerCase().includes('not found');

      if (isOrphan) {
        // ─── Orphan profile: لا auth user — نحدّث profile فقط ─────────────
        // المستخدم يتيم، لكن تعطيل الـ profile وحده كافٍ لمنع الوصول
        // طالما الـ RLS تفحص profiles.status
        console.warn(`admin-toggle-status: orphan profile for ${targetId}, updating profile status only`);

        const { error: profileOnlyError } = await context.adminClient
          .from('profiles')
          .update({ status: disabled ? 'inactive' : 'active', updated_at: new Date().toISOString() })
          .eq('id', targetId)
          .eq('tenant_id', context.callerProfile.tenant_id);

        if (profileOnlyError) {
          console.error('admin-toggle-status orphan profile update failed:', profileOnlyError.message);
          return json(req, { error: 'فشل تحديث حالة المستخدم' }, 500);
        }

        await audit(
          context.adminClient,
          context.callerProfile.tenant_id!,
          context.caller.id,
          targetId,
          'admin_toggle_status_orphan',
          { disabled, note: 'no auth user; profile-only update' },
        );

        return json(req, { success: true, disabled, orphan: true }, 200);
      }

      console.error('admin-toggle-status auth failed:', authError.message);
      return json(req, { error: 'فشل تحديث حالة المصادقة' }, 500);
    }

    // ─── تحديث profile بعد نجاح auth update ─────────────────────────────────
    const { error: profileError } = await context.adminClient
      .from('profiles')
      .update({ status: disabled ? 'inactive' : 'active', updated_at: new Date().toISOString() })
      .eq('id', targetId)
      .eq('tenant_id', context.callerProfile.tenant_id);

    if (profileError) {
      // auth تم تحديثه، لكن profile فشل — نسجّل تحذيراً ولا نفشل العملية
      console.error('admin-toggle-status profile sync failed (auth was updated):', profileError.message);
    }

    await audit(
      context.adminClient,
      context.callerProfile.tenant_id!,
      context.caller.id,
      targetId,
      'admin_toggle_status',
      { disabled },
    );

    return json(req, { success: true, disabled }, 200);

  } catch (error) {
    console.error('admin-toggle-status error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});