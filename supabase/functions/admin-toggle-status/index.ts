import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { audit, headers, isUuid, json, requireAdmin, targetInCallerTenant } from '../_shared/adminAuth.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;

  try {
    const body = await req.json() as { target_user_id?: unknown; disabled?: unknown };
    const targetId = body.target_user_id;
    const disabled = body.disabled === true;
    if (!isUuid(targetId)) return json(req, { error: 'target_user_id غير صالح' }, 400);
    if (targetId === context.caller.id) return json(req, { error: 'لا يمكن تعطيل المستخدم الحالي' }, 400);

    const target = await targetInCallerTenant(context.adminClient, targetId, context.callerProfile.tenant_id!);
    if (target.error || !target.profile) return json(req, { error: 'المستخدم غير موجود في الشركة' }, 404);

    const { error: authError } = await context.adminClient.auth.admin.updateUserById(targetId, {
      ban_duration: disabled ? '876000h' : 'none',
    });
    if (authError) {
      console.error('admin-toggle-status auth failed:', authError.message);
      return json(req, { error: 'فشل تحديث حالة المصادقة' }, 500);
    }

    const { error: profileError } = await context.adminClient
      .from('profiles')
      .update({ status: disabled ? 'inactive' : 'active', updated_at: new Date().toISOString() })
      .eq('id', targetId)
      .eq('tenant_id', context.callerProfile.tenant_id);
    if (profileError) {
      console.error('admin-toggle-status profile failed:', profileError.message);
      return json(req, { error: 'فشل تحديث ملف المستخدم' }, 500);
    }

    await audit(context.adminClient, context.callerProfile.tenant_id!, context.caller.id, targetId, 'admin_toggle_status', { disabled });
    return json(req, { success: true, disabled }, 200);
  } catch (error) {
    console.error('admin-toggle-status error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});
