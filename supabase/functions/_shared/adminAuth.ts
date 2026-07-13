import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export const TARGET_ROLES = new Set([
  'employee',
  'supervisor',
  'manager',
  'hr',
  'gatekeeper',
  'admin',
]);

export interface AdminProfile {
  id: string;
  full_name: string | null;
  role: string;
  tenant_id: string | null;
}

export interface AdminContext {
  caller: User;
  callerProfile: AdminProfile;
  adminClient: SupabaseClient;
}

export function headers(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'null',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function requireAdmin(req: Request): Promise<AdminContext | Response> {
  const allowedOrigin = Deno.env.get('APP_ORIGIN');
  const requestOrigin = req.headers.get('origin');
  if (!allowedOrigin) return json(req, { error: 'Function is not configured' }, 503);
  if (requestOrigin && requestOrigin !== allowedOrigin) return json(req, { error: 'Origin not allowed' }, 403);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith('Bearer ')) {
    return json(req, { error: 'Authentication or function configuration is missing' }, 503);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser();
  if (authError || !authData.user) return json(req, { error: 'جلسة غير صالحة' }, 401);

  const { data: profile, error: profileError } = await callerClient
    .from('profiles')
    .select('id, full_name, role, tenant_id')
    .eq('id', authData.user.id)
    .single();
  if (profileError || !profile || !['admin', 'developer', 'it_admin'].includes(String(profile.role))) {
    return json(req, { error: 'غير مخوّل. يتطلب صلاحية إدارية.' }, 403);
  }
  if (!profile.tenant_id) return json(req, { error: 'لا توجد شركة مرتبطة بالمستخدم الإداري.' }, 403);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    caller: authData.user,
    callerProfile: profile as AdminProfile,
    adminClient,
  };
}

export async function targetInCallerTenant(
  adminClient: SupabaseClient,
  targetUserId: string,
  tenantId: string,
): Promise<{ profile: AdminProfile | null; error: string | null }> {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, full_name, role, tenant_id')
    .eq('id', targetUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { profile: data as AdminProfile | null, error: error?.message || null };
}

export async function audit(
  adminClient: SupabaseClient,
  tenantId: string,
  callerId: string,
  targetId: string,
  action: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  await adminClient.from('security_events').insert({
    event_type: action,
    actor_id: callerId,
    target_id: targetId,
    tenant_id: tenantId,
    description: action,
    metadata: details,
    created_at: new Date().toISOString(),
  });
}
