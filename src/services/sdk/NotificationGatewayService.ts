import { supabase } from '../supabase/supabase';

export interface NotificationGatewayRow {
  id: string;
  user_id?: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  action_url?: string;
  group_key?: string;
  metadata?: Record<string, unknown>;
  expires_at?: string;
}

export interface NotificationCommand {
  type: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  title: string;
  message: string;
  actionUrl?: string;
  groupKey?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: string;
}

class NotificationGatewayService {
  async findUserIdsByRoles(roles: string[]): Promise<string[]> {
    const ids = new Set<string>();
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .in('role', roles)
      .eq('status', 'active');

    if (!profileError) {
      for (const profile of profiles ?? []) if (profile.id) ids.add(profile.id);
    }

    if (ids.size === 0) {
      const dbRoles = roles.map((role) => role === 'admin' ? 'system_admin' : role);
      const { data: employees, error } = await supabase
        .from('employees')
        .select('user_id')
        .in('role', dbRoles)
        .eq('is_active', true)
        .not('user_id', 'is', null);
      if (!error) {
        for (const employee of employees ?? []) if (employee.user_id) ids.add(employee.user_id);
      }
    }

    return [...ids];
  }

  async findManagerUserId(employeeIdOrUserId: string): Promise<string | null> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('manager_id')
      .eq('id', employeeIdOrUserId)
      .maybeSingle();
    if (profile?.manager_id) return profile.manager_id;

    const { data: employee } = await supabase
      .from('employees')
      .select('manager_id,user_id')
      .or(`id.eq.${employeeIdOrUserId},user_id.eq.${employeeIdOrUserId}`)
      .maybeSingle();
    if (!employee?.manager_id) return null;

    const { data: manager } = await supabase
      .from('employees')
      .select('user_id')
      .eq('id', employee.manager_id)
      .maybeSingle();
    return manager?.user_id ?? null;
  }

  async findSupervisorIds(employeeIdOrUserId: string): Promise<string[]> {
    const ids = new Set<string>();
    const managerId = await this.findManagerUserId(employeeIdOrUserId);
    if (managerId) ids.add(managerId);

    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['manager', 'hr', 'admin'])
      .eq('status', 'active');
    if (!error) for (const row of data ?? []) if (row.id) ids.add(row.id);
    return [...ids];
  }

  async create(targetUserId: string, notification: NotificationCommand): Promise<string | null> {
    const { data, error } = await supabase.rpc('create_notification_safe', {
      p_target_user: targetUserId,
      p_type: notification.type,
      p_priority: notification.priority,
      p_title: notification.title,
      p_message: notification.message,
      p_action_url: notification.actionUrl ?? null,
      p_group_key: notification.groupKey ?? null,
      p_metadata: notification.metadata ?? {},
      p_expires_at: notification.expiresAt ?? null,
    });
    if (error) throw new Error(error.message);
    return data?.toString() ?? null;
  }

  async unreadCount(): Promise<number | null> {
    const { data, error } = await supabase.rpc('my_unread_notification_count');
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : null;
  }

  async findForUser(userId: string, limit = 50, unreadOnly = false): Promise<NotificationGatewayRow[]> {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (unreadOnly) query = query.eq('is_read', false);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as NotificationGatewayRow[];
  }

  async markRead(userId: string, notificationId: string | number): Promise<void> {
    const { error } = await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  async markAllRead(userId: string): Promise<number> {
    const { data, error } = await supabase.from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false)
      .select('id');
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async remove(userId: string, notificationId: string | number): Promise<void> {
    const { error } = await supabase.from('notifications').delete()
      .eq('id', notificationId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
  }

  async removeAll(userId: string): Promise<number> {
    const { data, error } = await supabase.from('notifications').delete()
      .eq('user_id', userId)
      .select('id');
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async cleanupExpired(): Promise<number> {
    const { data, error } = await supabase.rpc('cleanup_expired_notifications');
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }
}

export const notificationGatewayService = new NotificationGatewayService();
