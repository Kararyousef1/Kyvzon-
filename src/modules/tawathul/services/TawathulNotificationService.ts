/**
 * إشعارات بوابة التواصل + عداد غير المقروء
 */

import { supabase } from '../../../services/supabase/supabase';
import { getTawathulTenantId } from '../utils/tenant';
import { requireAuthUserId, tawathulDbError } from '../utils/errors';
import type { TawathulNotification } from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

class TawathulNotificationService {
  private table = 'tawathul_notifications';

  async list(limit = 30): Promise<TawathulNotification[]> {
    const tenantId = getTawathulTenantId();
    const userId = await requireAuthUserId();
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) {
      // الجدول قد لا يكون مثبتاً قبل 302
      if (error.message?.includes('does not exist')) return [];
      tawathulDbError(error);
    }
    return (data || []) as TawathulNotification[];
  }

  async countUnread(): Promise<number> {
    const tenantId = getTawathulTenantId();
    const userId = await requireAuthUserId();
    const { count, error } = await supabase
      .from(this.table)
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) return 0;
    return count || 0;
  }

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from(this.table)
      .update({ is_read: true })
      .eq('id', id);
    if (error && !error.message?.includes('does not exist')) tawathulDbError(error);
  }

  async markAllRead(): Promise<void> {
    const tenantId = getTawathulTenantId();
    const userId = await requireAuthUserId();
    const { error } = await supabase
      .from(this.table)
      .update({ is_read: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error && !error.message?.includes('does not exist')) tawathulDbError(error);
  }

  /**
   * عداد تقريبي للمحادثات غير المقروءة من last_read_at
   */
  async countUnreadConversations(): Promise<number> {
    try {
      const tenantId = getTawathulTenantId();
      const userId = await requireAuthUserId();
      const { data: memberships } = await supabase
        .from('tawathul_members')
        .select('conversation_id, last_read_at')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .is('left_at', null);
      if (!memberships?.length) return 0;

      let unread = 0;
      // فحص مبسّط: محادثات last_message_at > last_read_at
      const ids = memberships.map((m) => m.conversation_id);
      const { data: convs } = await supabase
        .from('tawathul_conversations')
        .select('id, last_message_at')
        .in('id', ids)
        .is('deleted_at', null);

      const readMap = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]));
      for (const c of convs || []) {
        const lastRead = readMap.get(c.id);
        if (!c.last_message_at) continue;
        if (!lastRead || new Date(c.last_message_at) > new Date(lastRead)) unread += 1;
      }
      return unread;
    } catch {
      return 0;
    }
  }

  subscribe(onChange: () => void): RealtimeChannel | null {
    try {
      return supabase
        .channel('tawathul-notifications')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: this.table },
          () => onChange(),
        )
        .subscribe();
    } catch {
      return null;
    }
  }

  unsubscribe(channel: RealtimeChannel | null) {
    if (channel) void supabase.removeChannel(channel);
  }
}

export const tawathulNotificationService = new TawathulNotificationService();
export default tawathulNotificationService;
