/**
 * إدارة بوابة التواصل (إعدادات + إحصائيات)
 */

import { supabase } from '../../../services/supabase/supabase';
import { getTawathulTenantId, requireTawathulTenantId } from '../utils/tenant';
import { tawathulDbError } from '../utils/errors';
import type { TawathulSettings } from '../types';

class TawathulAdminService {
  private settingsTable = 'tawathul_settings';

  async getSettings(): Promise<TawathulSettings | null> {
    const tenantId = getTawathulTenantId();
    const { data, error } = await supabase
      .from(this.settingsTable)
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) {
      if (error.message?.includes('does not exist')) return null;
      tawathulDbError(error);
    }
    return data as TawathulSettings | null;
  }

  async updateSettings(patch: Partial<TawathulSettings>): Promise<TawathulSettings> {
    const tenantId = requireTawathulTenantId();
    const existing = await this.getSettings();
    if (!existing) {
      const { data, error } = await supabase
        .from(this.settingsTable)
        .insert({
          tenant_id: tenantId,
          is_enabled: patch.is_enabled ?? true,
          allow_dms: patch.allow_dms ?? true,
          allow_groups: patch.allow_groups ?? true,
          allow_channels: patch.allow_channels ?? true,
          allow_file_upload: patch.allow_file_upload ?? true,
          max_file_size_mb: patch.max_file_size_mb ?? 25,
          retention_days: patch.retention_days ?? 365,
        })
        .select()
        .single();
      if (error) tawathulDbError(error);
      return data as TawathulSettings;
    }

    const { data, error } = await supabase
      .from(this.settingsTable)
      .update({
        is_enabled: patch.is_enabled ?? existing.is_enabled,
        allow_dms: patch.allow_dms ?? existing.allow_dms,
        allow_groups: patch.allow_groups ?? existing.allow_groups,
        allow_channels: patch.allow_channels ?? existing.allow_channels,
        allow_file_upload: patch.allow_file_upload ?? existing.allow_file_upload,
        max_file_size_mb: patch.max_file_size_mb ?? existing.max_file_size_mb,
        retention_days: patch.retention_days ?? existing.retention_days,
      })
      .eq('tenant_id', tenantId)
      .select()
      .single();
    if (error) tawathulDbError(error);
    return data as TawathulSettings;
  }

  async getStats(): Promise<{
    conversations: number;
    messages: number;
    members: number;
    channels: number;
    attachments: number;
    unread_notifications: number;
  }> {
    const tenantId = getTawathulTenantId();
    const [c, m, mem, ch, att, unread] = await Promise.all([
      supabase
        .from('tawathul_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      supabase
        .from('tawathul_messages')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('deleted_at', null),
      supabase
        .from('tawathul_members')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .is('left_at', null),
      supabase
        .from('tawathul_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('type', 'channel')
        .is('deleted_at', null),
      supabase
        .from('tawathul_attachments')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('tawathul_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_read', false),
    ]);
    return {
      conversations: c.count || 0,
      messages: m.count || 0,
      members: mem.count || 0,
      channels: ch.count || 0,
      attachments: att.count || 0,
      unread_notifications: unread.count || 0,
    };
  }
}

export const tawathulAdminService = new TawathulAdminService();
export default tawathulAdminService;
