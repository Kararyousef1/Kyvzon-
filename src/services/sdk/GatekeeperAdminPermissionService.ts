import { supabase } from '../supabase/supabase';

export interface BreakManagerPermissionRecord {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  department?: string | null;
  position?: string | null;
  can_manage_breaks: boolean;
}

class GatekeeperAdminPermissionService {
  async findProfilePermissions(): Promise<BreakManagerPermissionRecord[]> {
    const { data, error } = await supabase.from('profiles')
      .select('id,full_name,email,role,department,position,can_manage_breaks')
      .order('full_name');
    if (error) throw new Error(error.message);
    return (data ?? []) as BreakManagerPermissionRecord[];
  }

  async updateBreakPermission(userId: string, canManageBreaks: boolean): Promise<void> {
    const { data, error } = await supabase.from('profiles')
      .update({ can_manage_breaks: canManageBreaks })
      .eq('id', userId)
      .select('id');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('RLS_ERROR');
  }
}

export const gatekeeperAdminPermissionService = new GatekeeperAdminPermissionService();
