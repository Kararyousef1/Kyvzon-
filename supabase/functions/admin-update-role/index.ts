import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { audit, headers, isUuid, json, requireAdmin, targetInCallerTenant, TARGET_ROLES } from '../_shared/adminAuth.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  const context = await requireAdmin(req);
  if (context instanceof Response) return context;

  try {
    const body = await req.json() as { target_user_id?: unknown; new_role?: unknown };
    const targetId = body.target_user_id;
    const newRole = String(body.new_role || '');
    if (!isUuid(targetId) || !TARGET_ROLES.has(newRole)) {
      return json(req, { error: 'البيانات غير صالحة' }, 400);
    }

    const target = await targetInCallerTenant(context.adminClient, targetId, context.callerProfile.tenant_id!);
    if (target.error || !target.profile) return json(req, { error: 'المستخدم غير موجود في الشركة' }, 404);
    if (['developer', 'it_admin'].includes(target.profile.role) && context.callerProfile.role !== 'developer') {
      return json(req, { error: 'لا يمكن تعديل مستخدم منصة' }, 403);
    }

    const { error: profileError } = await context.adminClient
      .from('profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('id', targetId)
      .eq('tenant_id', context.callerProfile.tenant_id);
    if (profileError) {
      console.error('admin-update-role profile failed:', profileError.message);
      return json(req, { error: 'فشل تحديث الدور' }, 500);
    }

    await context.adminClient.from('employees')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('user_id', targetId)
      .eq('tenant_id', context.callerProfile.tenant_id);

    await audit(context.adminClient, context.callerProfile.tenant_id!, context.caller.id, targetId, 'admin_update_role', { new_role: newRole });
    return json(req, { success: true, role: newRole }, 200);
  } catch (error) {
    console.error('admin-update-role error:', error instanceof Error ? error.message : String(error));
    return json(req, { error: 'خطأ داخلي في الخادم' }, 500);
  }
});
