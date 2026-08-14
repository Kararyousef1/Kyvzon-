import { supabase } from '../supabase/supabase';

export interface PermissionAuditRecord {
  id: string;
  emp_id: string;
  changed_by: string | null;
  action: string;
  old_permissions: Record<string, boolean>;
  new_permissions: Record<string, boolean>;
  timestamp: string;
}

class PermissionAdminService {
  async findRecentAuditLogs(employeeId: string, limit = 10): Promise<PermissionAuditRecord[]> {
    const { data, error } = await supabase.from('permission_audit_logs')
      .select('id,emp_id,changed_by,action,old_permissions,new_permissions,timestamp')
      .eq('emp_id', employeeId)
      .order('timestamp', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));
    if (error) throw new Error(error.message);
    return (data ?? []) as PermissionAuditRecord[];
  }

  async updateCustomPermissions(employeeId: string, permissions: Record<string, boolean>): Promise<void> {
    const { error } = await supabase.from('profiles')
      .update({ custom_permissions: permissions })
      .eq('id', employeeId);
    if (error) throw new Error(error.message);
  }
}

export const permissionAdminService = new PermissionAdminService();
