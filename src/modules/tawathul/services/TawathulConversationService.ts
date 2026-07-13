/**
 * TawathulConversationService — إدارة المحادثات (MVP)
 * متوافق مع profiles + auth.users في Kyvzon Platform
 */

import { supabase } from '../../../services/supabase/supabase';
import { SdkError, SdkErrorCode } from '../../../services/sdk/BaseService';
import {
  ensureDefaultTenantCached,
  getTawathulTenantId,
  requireTawathulTenantId,
} from '../utils/tenant';
import type {
  CreateChannelInput,
  CreateDmInput,
  CreateGroupInput,
  OpenEntityDiscussionInput,
  TawathulConversation,
  TawathulEntityLink,
  TawathulMember,
} from '../types';

async function requireAuthUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw SdkError.fromSupabaseError(error);
  const id = data.user?.id;
  if (!id) {
    throw new SdkError(SdkErrorCode.PERMISSION_DENIED, 'يجب تسجيل الدخول لاستخدام بوابة التواصل');
  }
  return id;
}

function friendlyDbError(error: { message?: string; code?: string } | null): never {
  const msg = error?.message || 'خطأ في قاعدة البيانات';
  if (msg.includes('tawathul_') || msg.includes('does not exist') || error?.code === '42P01') {
    throw new SdkError(
      SdkErrorCode.DATABASE_ERROR,
      'جداول بوابة التواصل غير مثبتة. نفّذ 300_tawathul_core.sql ثم 301_tawathul_rls.sql على Supabase',
    );
  }
  if (msg.includes('row-level security') || error?.code === '42501') {
    throw new SdkError(
      SdkErrorCode.PERMISSION_DENIED,
      'تم رفض العملية بسبب الصلاحيات (RLS). تأكد من عضويتك في المحادثة وتشغيل سكربت 301',
    );
  }
  throw SdkError.fromSupabaseError(error || { message: msg });
}

class TawathulConversationService {
  private conversations = 'tawathul_conversations';
  private members = 'tawathul_members';
  private entityLinks = 'tawathul_entity_links';

  /** محادثات المستخدم الحالي */
  async listMyConversations(): Promise<TawathulConversation[]> {
    ensureDefaultTenantCached();
    const tenantId = getTawathulTenantId();
    const userId = await requireAuthUserId();

    const { data: memberships, error: memErr } = await supabase
      .from(this.members)
      .select('conversation_id, is_pinned, last_read_at')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .is('left_at', null);

    if (memErr) friendlyDbError(memErr);
    if (!memberships?.length) return [];

    const ids = memberships.map((m) => m.conversation_id);
    const { data, error } = await supabase
      .from(this.conversations)
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', ids)
      .is('deleted_at', null)
      .order('last_message_at', { ascending: false });

    if (error) friendlyDbError(error);

    const pinMap = new Map(memberships.map((m) => [m.conversation_id, !!m.is_pinned]));
    const list = (data || []) as TawathulConversation[];

    list.sort((a, b) => {
      const ap = pinMap.get(a.id) ? 1 : 0;
      const bp = pinMap.get(b.id) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const at = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const bt = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return bt - at;
    });

    return list;
  }

  async getConversation(id: string): Promise<TawathulConversation | null> {
    const tenantId = getTawathulTenantId();
    const { data, error } = await supabase
      .from(this.conversations)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) friendlyDbError(error);
    return (data as TawathulConversation) || null;
  }

  async listMembers(conversationId: string): Promise<TawathulMember[]> {
    const tenantId = getTawathulTenantId();
    const { data, error } = await supabase
      .from(this.members)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .is('left_at', null);

    if (error) friendlyDbError(error);
    const rows = (data || []) as TawathulMember[];
    if (!rows.length) return [];

    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, profile_image')
      .in('id', userIds);

    const map = new Map((profiles || []).map((p: any) => [p.id, p]));
    return rows.map((r) => ({
      ...r,
      full_name: map.get(r.user_id)?.full_name,
      profile_image: map.get(r.user_id)?.profile_image,
    }));
  }

  /** محادثة فردية — يُعاد الموجود إن وُجد */
  async getOrCreateDm(input: CreateDmInput): Promise<TawathulConversation> {
    const tenantId = requireTawathulTenantId();
    const me = await requireAuthUserId();
    if (!input.otherUserId) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'يجب اختيار مستخدم');
    }
    if (input.otherUserId === me) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'لا يمكن إنشاء محادثة مع نفسك');
    }

    const { data: myMemberships, error: myErr } = await supabase
      .from(this.members)
      .select('conversation_id')
      .eq('tenant_id', tenantId)
      .eq('user_id', me)
      .is('left_at', null);
    if (myErr) friendlyDbError(myErr);

    const myConvIds = (myMemberships || []).map((m) => m.conversation_id);
    if (myConvIds.length) {
      const { data: otherMemberships, error: oErr } = await supabase
        .from(this.members)
        .select('conversation_id')
        .eq('tenant_id', tenantId)
        .eq('user_id', input.otherUserId)
        .in('conversation_id', myConvIds)
        .is('left_at', null);
      if (oErr) friendlyDbError(oErr);

      const shared = (otherMemberships || []).map((m) => m.conversation_id);
      if (shared.length) {
        const { data: existing, error: eErr } = await supabase
          .from(this.conversations)
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('type', 'dm')
          .in('id', shared)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        if (eErr) friendlyDbError(eErr);
        if (existing) return existing as TawathulConversation;
      }
    }

    // عنوان مؤقت من اسم الطرف الآخر (إن توفر)
    let title: string | null = null;
    const { data: otherProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', input.otherUserId)
      .maybeSingle();
    if (otherProfile?.full_name) title = otherProfile.full_name;

    const { data: conv, error } = await supabase
      .from(this.conversations)
      .insert({
        tenant_id: tenantId,
        type: 'dm',
        title,
        is_private: true,
        created_by: me,
      })
      .select()
      .single();
    if (error) friendlyDbError(error);

    const memberRows = [
      { tenant_id: tenantId, conversation_id: conv.id, user_id: me, role: 'owner' },
      {
        tenant_id: tenantId,
        conversation_id: conv.id,
        user_id: input.otherUserId,
        role: 'member',
      },
    ];
    const { error: memError } = await supabase.from(this.members).insert(memberRows);
    if (memError) friendlyDbError(memError);

    return conv as TawathulConversation;
  }

  async createGroup(input: CreateGroupInput): Promise<TawathulConversation> {
    const tenantId = requireTawathulTenantId();
    const me = await requireAuthUserId();
    if (!input.title?.trim()) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'عنوان المجموعة مطلوب');
    }

    const { data: conv, error } = await supabase
      .from(this.conversations)
      .insert({
        tenant_id: tenantId,
        type: 'group',
        title: input.title.trim(),
        description: input.description || null,
        is_private: input.isPrivate ?? true,
        created_by: me,
      })
      .select()
      .single();
    if (error) friendlyDbError(error);

    const uniqueMembers = Array.from(new Set([me, ...(input.memberIds || []).filter(Boolean)]));
    const rows = uniqueMembers.map((uid) => ({
      tenant_id: tenantId,
      conversation_id: conv.id,
      user_id: uid,
      role: uid === me ? 'owner' : 'member',
    }));
    const { error: memError } = await supabase.from(this.members).insert(rows);
    if (memError) friendlyDbError(memError);

    return conv as TawathulConversation;
  }

  async createChannel(input: CreateChannelInput): Promise<TawathulConversation> {
    const tenantId = requireTawathulTenantId();
    const me = await requireAuthUserId();
    if (!input.title?.trim()) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'اسم القناة مطلوب');
    }

    const { data: conv, error } = await supabase
      .from(this.conversations)
      .insert({
        tenant_id: tenantId,
        type: 'channel',
        title: input.title.trim(),
        description: input.description || null,
        is_private: input.isPrivate ?? false,
        created_by: me,
      })
      .select()
      .single();
    if (error) friendlyDbError(error);

    const uniqueMembers = Array.from(new Set([me, ...(input.memberIds || []).filter(Boolean)]));
    const rows = uniqueMembers.map((uid) => ({
      tenant_id: tenantId,
      conversation_id: conv.id,
      user_id: uid,
      role: uid === me ? 'owner' : 'member',
    }));
    const { error: memError } = await supabase.from(this.members).insert(rows);
    if (memError) friendlyDbError(memError);

    return conv as TawathulConversation;
  }

  /** فتح أو استرجاع نقاش مرتبط بسجل ERP */
  async openEntityDiscussion(input: OpenEntityDiscussionInput): Promise<TawathulConversation> {
    const tenantId = requireTawathulTenantId();
    const me = await requireAuthUserId();
    if (!input.entityType || !input.entityId) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'بيانات السجل غير مكتملة');
    }

    const { data: existingLink, error: linkFindErr } = await supabase
      .from(this.entityLinks)
      .select('conversation_id')
      .eq('tenant_id', tenantId)
      .eq('entity_type', input.entityType)
      .eq('entity_id', input.entityId)
      .maybeSingle();
    if (linkFindErr) friendlyDbError(linkFindErr);

    if (existingLink?.conversation_id) {
      await this.ensureMember(existingLink.conversation_id, me);
      const conv = await this.getConversation(existingLink.conversation_id);
      if (conv) return conv;
    }

    const { data: conv, error } = await supabase
      .from(this.conversations)
      .insert({
        tenant_id: tenantId,
        type: 'entity',
        title: input.title || `نقاش ${input.entityType}`,
        is_private: true,
        created_by: me,
        metadata: { entity_type: input.entityType, entity_id: input.entityId },
      })
      .select()
      .single();
    if (error) friendlyDbError(error);

    const uniqueMembers = Array.from(new Set([me, ...(input.memberIds || []).filter(Boolean)]));
    const rows = uniqueMembers.map((uid) => ({
      tenant_id: tenantId,
      conversation_id: conv.id,
      user_id: uid,
      role: uid === me ? 'owner' : 'member',
    }));
    const { error: memError } = await supabase.from(this.members).insert(rows);
    if (memError) friendlyDbError(memError);

    const { error: linkError } = await supabase.from(this.entityLinks).insert({
      tenant_id: tenantId,
      conversation_id: conv.id,
      entity_type: input.entityType,
      entity_id: input.entityId,
      title: input.title,
      created_by: me,
    });
    if (linkError) friendlyDbError(linkError);

    return conv as TawathulConversation;
  }

  async getEntityLink(conversationId: string): Promise<TawathulEntityLink | null> {
    const tenantId = getTawathulTenantId();
    const { data, error } = await supabase
      .from(this.entityLinks)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .maybeSingle();
    if (error) friendlyDbError(error);
    return (data as TawathulEntityLink) || null;
  }

  async ensureMember(conversationId: string, userId: string, role: string = 'member') {
    const tenantId = requireTawathulTenantId();
    const { data: existing, error } = await supabase
      .from(this.members)
      .select('id, left_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) friendlyDbError(error);

    if (existing && !existing.left_at) return;
    if (existing?.left_at) {
      const { error: upErr } = await supabase
        .from(this.members)
        .update({ left_at: null, joined_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (upErr) friendlyDbError(upErr);
      return;
    }

    const { error: insErr } = await supabase.from(this.members).insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      user_id: userId,
      role,
    });
    if (insErr) friendlyDbError(insErr);
  }

  async markRead(conversationId: string) {
    try {
      const tenantId = getTawathulTenantId();
      const userId = await requireAuthUserId();
      await supabase
        .from(this.members)
        .update({ last_read_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
    } catch {
      // غير حرج
    }
  }

  /** عناوين ودّية للـ DM عند غياب title */
  async resolveDisplayTitle(
    conv: TawathulConversation,
    currentUserId?: string | null,
  ): Promise<string> {
    if (conv.title?.trim()) return conv.title;
    if (conv.type !== 'dm') {
      if (conv.type === 'entity') return 'نقاش مرتبط';
      if (conv.type === 'channel') return 'قناة';
      if (conv.type === 'group') return 'مجموعة';
      return 'محادثة';
    }
    try {
      const members = await this.listMembers(conv.id);
      const other = members.find((m) => m.user_id !== currentUserId);
      return other?.full_name || 'محادثة خاصة';
    } catch {
      return 'محادثة خاصة';
    }
  }
}

export const tawathulConversationService = new TawathulConversationService();
export default tawathulConversationService;
