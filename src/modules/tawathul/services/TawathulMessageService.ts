/**
 * TawathulMessageService — رسائل + ردود + تفاعلات + ملفات + بحث + Realtime
 */

import { supabase } from '../../../services/supabase/supabase';
import { SdkError, SdkErrorCode } from '../../../services/sdk/BaseService';
import { getTawathulTenantId, requireTawathulTenantId } from '../utils/tenant';
import { requireAuthUserId, tawathulDbError } from '../utils/errors';
import type {
  SendMessageInput,
  TawathulAttachment,
  TawathulMessage,
  TawathulReaction,
  TawathulReactionSummary,
} from '../types';
import type { RealtimeChannel } from '@supabase/supabase-js';

const BUCKET = 'tawathul';

function detectKind(file: File): TawathulAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'voice';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
}

function extractMentions(body: string): string[] {
  // يدعم @[uuid] أو @uuid
  const re = /@\[?([0-9a-fA-F-]{36})\]?/g;
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) ids.add(m[1]);
  return Array.from(ids);
}

class TawathulMessageService {
  private table = 'tawathul_messages';
  private reactionsTable = 'tawathul_reactions';
  private attachmentsTable = 'tawathul_attachments';

  async listMessages(
    conversationId: string,
    options?: { limit?: number; before?: string },
  ): Promise<TawathulMessage[]> {
    const tenantId = getTawathulTenantId();
    let query = supabase
      .from(this.table)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(options?.limit ?? 80);

    if (options?.before) query = query.lt('created_at', options.before);

    const { data, error } = await query;
    if (error) tawathulDbError(error);

    const rows = ((data || []) as TawathulMessage[]).reverse();
    return this.enrichMessages(rows, conversationId);
  }

  async searchMessages(queryText: string, conversationId?: string): Promise<TawathulMessage[]> {
    const tenantId = getTawathulTenantId();
    const q = queryText.trim();
    if (!q) return [];

    let query = supabase
      .from(this.table)
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .ilike('body', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(40);

    if (conversationId) query = query.eq('conversation_id', conversationId);

    const { data, error } = await query;
    if (error) tawathulDbError(error);
    const rows = (data || []) as TawathulMessage[];
    return this.enrichMessages(rows);
  }

  private async enrichMessages(
    messages: TawathulMessage[],
    conversationId?: string,
  ): Promise<TawathulMessage[]> {
    if (!messages.length) return messages;
    // نستخدم authService عبر utils/errors بدلاً من supabase.auth مباشرة
    let me = '';
    try { me = await requireAuthUserId(); } catch { /* enrichment يعمل بدون me */ }
    const ids = messages.map((m) => m.id);
    const senderIds = Array.from(
      new Set(messages.map((m) => m.sender_id).filter(Boolean)),
    ) as string[];
    const replyIds = Array.from(
      new Set(messages.map((m) => m.reply_to_id).filter(Boolean)),
    ) as string[];

    const safeQuery = async <T,>(fn: () => any): Promise<T[]> => {
      try {
        const res = await fn();
        if (res?.error) return [];
        return (res?.data as T[]) || [];
      } catch {
        return [];
      }
    };

    const [profilesList, reactions, files, repliesList] = await Promise.all([
      senderIds.length
        ? safeQuery<any>(() =>
            supabase.from('profiles').select('id, full_name, profile_image').in('id', senderIds),
          )
        : Promise.resolve([] as any[]),
      safeQuery<TawathulReaction>(() =>
        supabase.from(this.reactionsTable).select('*').in('message_id', ids),
      ),
      safeQuery<TawathulAttachment>(() =>
        supabase.from(this.attachmentsTable).select('*').in('message_id', ids),
      ),
      replyIds.length
        ? safeQuery<any>(() =>
            supabase.from(this.table).select('id, body, sender_id').in('id', replyIds),
          )
        : Promise.resolve([] as any[]),
    ]);

    const profiles = new Map(profilesList.map((p: any) => [p.id, p]));
    const replies = new Map(repliesList.map((r: any) => [r.id, r]));

    const reactionsByMsg = new Map<string, TawathulReaction[]>();
    for (const r of reactions) {
      const list = reactionsByMsg.get(r.message_id) || [];
      list.push(r);
      reactionsByMsg.set(r.message_id, list);
    }
    const filesByMsg = new Map<string, TawathulAttachment[]>();
    for (const f of files) {
      const list = filesByMsg.get(f.message_id) || [];
      list.push(f);
      filesByMsg.set(f.message_id, list);
    }

    return messages.map((m) => {
      const p = m.sender_id ? profiles.get(m.sender_id) : null;
      const msgReactions = reactionsByMsg.get(m.id) || [];
      const summaryMap = new Map<string, TawathulReactionSummary>();
      for (const r of msgReactions) {
        const cur = summaryMap.get(r.emoji) || {
          emoji: r.emoji,
          count: 0,
          reactedByMe: false,
          user_ids: [],
        };
        cur.count += 1;
        cur.user_ids.push(r.user_id);
        if (r.user_id === me) cur.reactedByMe = true;
        summaryMap.set(r.emoji, cur);
      }
      const reply = m.reply_to_id ? replies.get(m.reply_to_id) : null;
      return {
        ...m,
        mentions: Array.isArray(m.mentions)
          ? (m.mentions as string[])
          : typeof m.mentions === 'string'
            ? []
            : ((m.mentions as any) || []),
        sender_name: p?.full_name || (m.sender_id ? 'مستخدم' : 'النظام'),
        sender_avatar: p?.profile_image || null,
        reaction_summary: Array.from(summaryMap.values()),
        files: filesByMsg.get(m.id) || [],
        reply_preview: reply?.body ? String(reply.body).slice(0, 120) : null,
      };
    });
  }

  async sendMessage(input: SendMessageInput): Promise<TawathulMessage> {
    const tenantId = requireTawathulTenantId();
    const me = await requireAuthUserId();
    const body = (input.body || '').trim();
    const files = input.files || [];
    if (!body && !files.length) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'أدخل نصاً أو مرفقاً');
    }
    if (!input.conversationId) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'المحادثة غير محددة');
    }

    const mentions = Array.from(
      new Set([...(input.mentions || []), ...extractMentions(body)]),
    );

    const messageType =
      input.messageType ||
      (files.length && !body
        ? files[0].type.startsWith('audio/')
          ? 'voice'
          : 'file'
        : 'text');

    const { data, error } = await supabase
      .from(this.table)
      .insert({
        tenant_id: tenantId,
        conversation_id: input.conversationId,
        sender_id: me,
        message_type: messageType,
        body: body || (files.length ? `مرفق: ${files.map((f) => f.name).join(', ')}` : null),
        reply_to_id: input.replyToId || null,
        mentions,
      })
      .select()
      .single();

    if (error) tawathulDbError(error);
    const message = data as TawathulMessage;

    if (files.length) {
      try {
        await this.uploadAttachments(message, files, me, tenantId);
      } catch (e) {
        console.error('attachment upload failed', e);
      }
    }

    const [enriched] = await this.enrichMessages([message], input.conversationId);
    return enriched;
  }

  private async uploadAttachments(
    message: TawathulMessage,
    files: File[],
    userId: string,
    tenantId: string,
  ) {
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        throw new SdkError(SdkErrorCode.VALIDATION_ERROR, `الملف ${file.name} أكبر من 25MB`);
      }
      const safeName = file.name.replace(/[^\w.\-()\u0600-\u06FF\s]/g, '_');
      const path = `${tenantId}/${message.conversation_id}/${message.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (upErr) {
        // fallback bucket public-assets إن لم يوجد tawathul
        const fb = await supabase.storage
          .from('public-assets')
          .upload(`tawathul/${path}`, file, { upsert: false });
        if (fb.error) throw fb.error;
        const { data: urlData } = supabase.storage
          .from('public-assets')
          .getPublicUrl(`tawathul/${path}`);
        await supabase.from(this.attachmentsTable).insert({
          tenant_id: tenantId,
          message_id: message.id,
          conversation_id: message.conversation_id,
          uploaded_by: userId,
          file_name: file.name,
          file_path: `tawathul/${path}`,
          file_url: urlData.publicUrl,
          mime_type: file.type,
          file_size: file.size,
          kind: detectKind(file),
        });
        continue;
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error: insErr } = await supabase.from(this.attachmentsTable).insert({
        tenant_id: tenantId,
        message_id: message.id,
        conversation_id: message.conversation_id,
        uploaded_by: userId,
        file_name: file.name,
        file_path: path,
        file_url: urlData.publicUrl,
        mime_type: file.type,
        file_size: file.size,
        kind: detectKind(file),
      });
      if (insErr) console.error(insErr);
    }
  }

  async editMessage(messageId: string, body: string): Promise<TawathulMessage> {
    const tenantId = getTawathulTenantId();
    const text = body.trim();
    if (!text) throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'النص فارغ');
    const { data, error } = await supabase
      .from(this.table)
      .update({
        body: text,
        edited_at: new Date().toISOString(),
        mentions: extractMentions(text),
      })
      .eq('tenant_id', tenantId)
      .eq('id', messageId)
      .select()
      .single();
    if (error) tawathulDbError(error);
    const [enriched] = await this.enrichMessages([data as TawathulMessage]);
    return enriched;
  }

  async softDeleteMessage(messageId: string): Promise<void> {
    const tenantId = getTawathulTenantId();
    const { error } = await supabase
      .from(this.table)
      .update({ deleted_at: new Date().toISOString(), body: null })
      .eq('tenant_id', tenantId)
      .eq('id', messageId);
    if (error) tawathulDbError(error);
  }

  async togglePinMessage(messageId: string, pinned: boolean): Promise<void> {
    const tenantId = getTawathulTenantId();
    const { error } = await supabase
      .from(this.table)
      .update({ is_pinned: pinned })
      .eq('tenant_id', tenantId)
      .eq('id', messageId);
    if (error) tawathulDbError(error);
  }

  async toggleReaction(
    messageId: string,
    conversationId: string,
    emoji: string,
  ): Promise<void> {
    const tenantId = requireTawathulTenantId();
    const me = await requireAuthUserId();

    const { data: existing } = await supabase
      .from(this.reactionsTable)
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', me)
      .eq('emoji', emoji)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from(this.reactionsTable).delete().eq('id', existing.id);
      if (error) tawathulDbError(error);
      return;
    }

    const { error } = await supabase.from(this.reactionsTable).insert({
      tenant_id: tenantId,
      message_id: messageId,
      conversation_id: conversationId,
      user_id: me,
      emoji,
    });
    if (error) tawathulDbError(error);
  }

  async listPinned(conversationId: string): Promise<TawathulMessage[]> {
    const tenantId = getTawathulTenantId();
    const { data, error } = await supabase
      .from(this.table)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('is_pinned', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) {
      // عمود is_pinned قد لا يكون موجوداً قبل 302
      return [];
    }
    return this.enrichMessages((data || []) as TawathulMessage[], conversationId);
  }

  subscribeToConversation(
    conversationId: string,
    handlers: {
      onInsert?: (message: TawathulMessage) => void;
      onUpdate?: (message: TawathulMessage) => void;
      onReactionChange?: () => void;
    },
  ): RealtimeChannel {
    const tenantId = getTawathulTenantId();
    const channel = supabase
      .channel(`tawathul-msg:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: this.table,
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as TawathulMessage;
          if (row.tenant_id && row.tenant_id !== tenantId) return;
          if (row.deleted_at) return;
          try {
            const [enriched] = await this.enrichMessages([row], conversationId);
            handlers.onInsert?.(enriched);
          } catch {
            handlers.onInsert?.(row);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: this.table,
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const row = payload.new as TawathulMessage;
          try {
            const [enriched] = await this.enrichMessages([row], conversationId);
            handlers.onUpdate?.(enriched);
          } catch {
            handlers.onUpdate?.(row);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: this.reactionsTable,
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => handlers.onReactionChange?.(),
      )
      .subscribe();

    return channel;
  }

  unsubscribe(channel: RealtimeChannel | null) {
    if (channel) void supabase.removeChannel(channel);
  }
}

export const tawathulMessageService = new TawathulMessageService();
export default tawathulMessageService;
