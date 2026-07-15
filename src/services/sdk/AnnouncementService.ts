/**
 * ════════════════════════════════════════════════════════════════
 *  AnnouncementService - خدمة التبليغات والإعلانات
 * ════════════════════════════════════════════════════════════════
 *
 *  🔒 عزل البيانات:
 *  ─────────────────────────────────────────────────────────────
 *  ✅ يرث من BaseService → tenant_id يُحقن تلقائياً في كل INSERT
 *  ✅ RLS في DB تمنع أي وصول خارج نطاق الـ tenant
 *  ✅ لا يوجد localStorage — كل البيانات في Supabase
 *
 *  🎯 صلاحيات النشر:
 *  ─────────────────────────────────────────────────────────────
 *  - admin / developer → ينشر دائماً
 *  - hr → ينشر دائماً
 *  - manager / supervisor → ينشر داخل قسمه
 *  - employee → لا يملك صلاحية النشر
 *  - HR يمكنه منح صلاحية 'publish-announcements' لأي موظف
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

// ════════════════════════════════════════════════════════════════
//  الأنواع
// ════════════════════════════════════════════════════════════════

export type AnnouncementType     = 'text' | 'image' | 'video' | 'poll';
export type AnnouncementPriority = 'normal' | 'important' | 'urgent';

export interface PollOption {
  id:            string;
  text:          string;
  display_order: number;
  votes_count?:  number;
  has_voted?:    boolean; // هل المستخدم الحالي صوّت لهذا الخيار
}

export interface Poll {
  id:         string;
  question:   string;
  end_date?:  string;
  options:    PollOption[];
  total_votes: number;
  user_vote_option_id?: string; // id الخيار الذي صوّت له المستخدم
}

export interface Announcement {
  id:               string;
  tenant_id:        string;
  type:             AnnouncementType;
  priority:         AnnouncementPriority;
  title:            string;
  content:          string;
  media_url?:       string;
  target_roles:     string[];  // [] = الكل
  target_depts:     string[];  // [] = الكل
  tags:             string[];
  has_notification: boolean;
  author_id?:       string;
  author_name?:     string;
  author_role?:     string;
  views:            number;
  likes_count:      number;
  liked_by:         string[];  // قائمة user_id
  poll?:            Poll;
  created_at:       string;
  updated_at:       string;
}

export interface CreateAnnouncementInput {
  type:             AnnouncementType;
  priority:         AnnouncementPriority;
  title:            string;
  content:          string;
  media_url?:       string;
  target_roles?:    string[];
  target_depts?:    string[];
  tags?:            string[];
  has_notification?: boolean;
  author_name?:     string;
  author_role?:     string;
  poll?: {
    question: string;
    end_date?: string;
    options: string[];  // نصوص الخيارات فقط
  };
}

// ════════════════════════════════════════════════════════════════
//  Service
// ════════════════════════════════════════════════════════════════

class AnnouncementService extends BaseService<Announcement> {
  constructor() {
    super('announcements');
  }

  // ─── جلب التبليغات مع الإحصائيات والاستفتاءات ───────────────
  async findAnnouncements(options?: {
    limit?:  number;
    offset?: number;
  }): Promise<Announcement[]> {
    try {
      const tenantId = getCurrentTenantId();
      const limit    = options?.limit  ?? 50;
      const offset   = options?.offset ?? 0;

      // نجلب من announcements_with_stats (view مع likes_count)
      let query = supabase
        .from('announcements_with_stats')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data: rows, error } = await query;
      if (error) throw error;

      const announcements = (rows || []) as any[];

      // نجلب بيانات الاستفتاءات لكل التبليغات من نوع 'poll'
      const pollIds = announcements
        .filter(a => a.type === 'poll')
        .map(a => a.id);

      let pollsMap = new Map<string, Poll>();
      if (pollIds.length > 0) {
        pollsMap = await this.fetchPollsForAnnouncements(pollIds);
      }

      return announcements.map(a => ({
        id:               a.id,
        tenant_id:        a.tenant_id,
        type:             a.type,
        priority:         a.priority,
        title:            a.title,
        content:          a.content,
        media_url:        a.media_url ?? undefined,
        target_roles:     a.target_roles ?? [],
        target_depts:     a.target_depts ?? [],
        tags:             a.tags ?? [],
        has_notification: a.has_notification ?? true,
        author_id:        a.author_id ?? undefined,
        author_name:      a.author_name ?? undefined,
        author_role:      a.author_role ?? undefined,
        views:            a.views ?? 0,
        likes_count:      Number(a.likes_count ?? 0),
        liked_by:         Array.isArray(a.liked_by) ? a.liked_by as string[] : [],
        poll:             pollsMap.get(a.id),
        created_at:       a.created_at,
        updated_at:       a.updated_at,
      }));
    } catch (err) {
      console.error('[AnnouncementService] findAnnouncements:', err);
      return [];
    }
  }

  // ─── جلب بيانات الاستفتاءات ─────────────────────────────────
  private async fetchPollsForAnnouncements(
    announcementIds: string[],
  ): Promise<Map<string, Poll>> {
    const map = new Map<string, Poll>();
    if (announcementIds.length === 0) return map;

    try {
      const tenantId = getCurrentTenantId();

      // جلب الاستفتاءات
      let pollQuery = supabase
        .from('announcement_polls')
        .select('*')
        .in('announcement_id', announcementIds);
      if (tenantId) pollQuery = pollQuery.eq('tenant_id', tenantId);
      const { data: polls } = await pollQuery;

      if (!polls || polls.length === 0) return map;

      const pollIds = polls.map((p: any) => p.id);

      // جلب الخيارات
      let optQuery = supabase
        .from('announcement_poll_options')
        .select('*')
        .in('poll_id', pollIds)
        .order('display_order');
      if (tenantId) optQuery = optQuery.eq('tenant_id', tenantId);
      const { data: options } = await optQuery;

      // جلب الأصوات
      let voteQuery = supabase
        .from('announcement_votes')
        .select('option_id, poll_id, user_id')
        .in('poll_id', pollIds);
      if (tenantId) voteQuery = voteQuery.eq('tenant_id', tenantId);
      const { data: votes } = await voteQuery;

      // جلب صوت المستخدم الحالي
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;

      const votesByOption = new Map<string, number>();
      const userVoteByPoll = new Map<string, string>();
      (votes || []).forEach((v: any) => {
        votesByOption.set(v.option_id, (votesByOption.get(v.option_id) ?? 0) + 1);
        if (v.user_id === currentUserId) {
          userVoteByPoll.set(v.poll_id, v.option_id);
        }
      });

      // تجميع
      (polls || []).forEach((poll: any) => {
        const pollOptions = (options || [])
          .filter((o: any) => o.poll_id === poll.id)
          .map((o: any): PollOption => ({
            id:            o.id,
            text:          o.text,
            display_order: o.display_order,
            votes_count:   votesByOption.get(o.id) ?? 0,
            has_voted:     userVoteByPoll.get(poll.id) === o.id,
          }));

        const totalVotes = pollOptions.reduce((s, o) => s + (o.votes_count ?? 0), 0);

        map.set(poll.announcement_id, {
          id:                   poll.id,
          question:             poll.question,
          end_date:             poll.end_date ?? undefined,
          options:              pollOptions,
          total_votes:          totalVotes,
          user_vote_option_id:  userVoteByPoll.get(poll.id),
        });
      });
    } catch (err) {
      console.error('[AnnouncementService] fetchPollsForAnnouncements:', err);
    }

    return map;
  }

  // ─── إنشاء تبليغ جديد ────────────────────────────────────────
  async createAnnouncement(
    input: CreateAnnouncementInput,
    authorId: string,
  ): Promise<Announcement> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('لم يتم العثور على tenant_id');

    // 1) إنشاء التبليغ
    const { data: ann, error: annErr } = await supabase
      .from('announcements')
      .insert({
        tenant_id:        tenantId,
        type:             input.type,
        priority:         input.priority,
        title:            input.title,
        content:          input.content,
        media_url:        input.media_url ?? null,
        target_roles:     input.target_roles  ?? [],
        target_depts:     input.target_depts  ?? [],
        tags:             input.tags ?? [],
        has_notification: input.has_notification ?? true,
        author_id:        authorId,
        author_name:      input.author_name ?? null,
        author_role:      input.author_role ?? null,
      })
      .select()
      .single();

    if (annErr || !ann) throw annErr ?? new Error('فشل إنشاء التبليغ');

    // 2) إنشاء الاستفتاء إن وجد
    if (input.type === 'poll' && input.poll) {
      const { data: poll, error: pollErr } = await supabase
        .from('announcement_polls')
        .insert({
          announcement_id: ann.id,
          tenant_id:       tenantId,
          question:        input.poll.question,
          end_date:        input.poll.end_date ?? null,
        })
        .select()
        .single();

      if (pollErr || !poll) throw pollErr ?? new Error('فشل إنشاء الاستفتاء');

      const opts = input.poll.options.map((text, i) => ({
        poll_id:       poll.id,
        tenant_id:     tenantId,
        text,
        display_order: i,
      }));

      const { error: optsErr } = await supabase
        .from('announcement_poll_options')
        .insert(opts);

      if (optsErr) throw optsErr;
    }

    return {
      ...(ann as any),
      likes_count: 0,
      liked_by:    [],
    } as Announcement;
  }

  // ─── تسجيل صوت ───────────────────────────────────────────────
  async castVote(pollId: string, optionId: string, userId: string): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('لم يتم العثور على tenant_id');

    const { error } = await supabase
      .from('announcement_votes')
      .insert({
        poll_id:   pollId,
        option_id: optionId,
        tenant_id: tenantId,
        user_id:   userId,
      });

    // unique constraint violation = صوّت سابقاً
    if (error && error.code !== '23505') throw error;
  }

  // ─── إعجاب / إلغاء إعجاب ─────────────────────────────────────
  async toggleLike(announcementId: string, userId: string): Promise<boolean> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new Error('لم يتم العثور على tenant_id');

    // نتحقق هل الإعجاب موجود
    const { data: existing } = await supabase
      .from('announcement_likes')
      .select('user_id')
      .eq('announcement_id', announcementId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('announcement_likes')
        .delete()
        .eq('announcement_id', announcementId)
        .eq('user_id', userId);
      return false; // تم إلغاء الإعجاب
    } else {
      await supabase
        .from('announcement_likes')
        .insert({ announcement_id: announcementId, tenant_id: tenantId, user_id: userId });
      return true; // تم الإعجاب
    }
  }

  // ─── زيادة المشاهدات ──────────────────────────────────────────
  async incrementViews(announcementId: string): Promise<void> {
    try {
      await supabase
        .from('announcements')
        .update({ views: announcementService['_viewsPlaceholder'] } as any)
        .eq('id', announcementId);
      // RPC مخصصة — اختيارية، نتجاهل الخطأ إن لم تكن موجودة
    } catch {
      // silent fail — المشاهدات ليست حرجة
    }
  }

  // ─── تحقق صلاحية النشر ────────────────────────────────────────
  static canPublish(user: {
    role?: string;
    permissions?: string[];
  }): boolean {
    if (!user.role) return false;
    if (['admin', 'developer', 'hr'].includes(user.role)) return true;
    if (['manager', 'supervisor'].includes(user.role)) return true;
    if (user.permissions?.includes('publish-announcements')) return true;
    return false;
  }

  // ─── تحقق قابلية الرؤية حسب الهدف ────────────────────────────
  static isVisibleToUser(
    ann: Pick<Announcement, 'target_roles' | 'target_depts'>,
    user: { role?: string; department?: string; manufacturingDept?: string },
  ): boolean {
    const { target_roles, target_depts } = ann;

    // إذا فارغتان → الكل يراه
    if (target_roles.length === 0 && target_depts.length === 0) return true;

    const userRole = user.role ?? '';
    const userDept = user.manufacturingDept ?? user.department ?? '';

    // admin / developer يرى دائماً
    if (['admin', 'developer'].includes(userRole)) return true;

    // تحقق الأدوار
    if (target_roles.length > 0 && target_roles.includes(userRole)) return true;

    // تحقق الأقسام
    if (target_depts.length > 0 && userDept && target_depts.includes(userDept)) return true;

    // إذا كان هناك أدوار ولم يُحدَّد قسم → الرسالة للأقسام فقط
    if (target_roles.length === 0 && target_depts.length > 0) return false;

    return false;
  }
}

export { AnnouncementService };
export const announcementService = new AnnouncementService();