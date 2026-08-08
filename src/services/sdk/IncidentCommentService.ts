/**
 * ════════════════════════════════════════════════════════════════
 *  IncidentCommentService - خدمة تعليقات البلاغات
 *  Domain: تستخدم supabase مباشرة للاستعلامات المعقدة (join)
 *  مع BaseService للـ CRUD الأساسي
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import { incidentErrorMessage } from './IncidentService';
import type { IncidentCommentRecord } from '../../shared/types/sdk';
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';

export interface CommentDetail {
  id: string;
  incident_id: string;
  /** ★ 0342: `null` حين يكون الكاتب صاحبَ بلاغ مجهول — الإخفاء من القاعدة */
  user_id: string | null;
  text: string;
  is_internal: boolean;
  created_at: string;
  user_name?: string;
  user_role?: string;
  /** ★ 0342: هل التعليق لي؟ يُحسب في القاعدة */
  is_mine?: boolean;
}


class IncidentCommentService extends BaseService<IncidentCommentRecord> {
  constructor() {
    super('incident_comments');
  }

  /**
   * خيط تعليقات البلاغ (migration 0342).
   *
   * ★★★ كانت تستعلم عن الجدول مباشرةً بـ`profiles(full_name, role)`.
   *   المشكلة لم تكن الاستعلام بل **من يرى ماذا**:
   *   `kyvzon_incident_comments_select` تشترط `user_id = auth.uid()`
   *   أي **كاتب التعليق** لا صاحب البلاغ. مُقاس على بلاغ فيه ثلاثة
   *   تعليقات: صاحبه يرى **1** (تعليقه هو) والموارد ترى 3 ⇒ المحادثة
   *   أحادية الاتجاه، الموظف يكتب ولا يرى الجواب.
   *
   * ★★ والدالة تُخفي اسم صاحب البلاغ المجهول في تعليقاته أيضاً —
   *   وإلا كُشفت الهوية من الخيط رغم إخفائها في الصندوق (0338).
   */
  async thread(incidentId: string): Promise<CommentDetail[]> {
    const { data, error } = await supabase.rpc('incident_thread', {
      p_incident_id: incidentId,
    });
    if (error) {
      logger.error('incident_thread فشل: ' + error.message, {
        component: 'IncidentCommentService', action: 'thread',
      });
      return [];
    }
    type Raw = {
      out_id: string; out_text: string; out_is_internal: boolean;
      out_author_id: string | null; out_author: string;
      out_is_mine: boolean; out_created_at: string;
    };
    return ((data ?? []) as Raw[]).map((r) => ({
      id: r.out_id,
      incident_id: incidentId,
      user_id: r.out_author_id,
      text: r.out_text,
      is_internal: Boolean(r.out_is_internal),
      created_at: r.out_created_at,
      user_name: r.out_author,
      is_mine: Boolean(r.out_is_mine),
    }));
  }

  /**
   * إضافة تعليق (migration 0342).
   *
   * ★★★ `addComment` القديمة لم تمرّر `tenant_id` والسياسة تشترطه.
   *   مُقاس بجلسة RLS: `new row violates row-level security policy
   *   for table "incident_comments"` ⇒ **إضافة أي تعليق مستحيلة**.
   * ★ ولا تستقبل `user_id` — تشتقّه القاعدة من الجلسة.
   */
  async add(incidentId: string, text: string, isInternal = false): Promise<string> {
    const { data, error } = await supabase.rpc('add_incident_comment', {
      p_incident_id: incidentId,
      p_text: text,
      p_internal: isInternal,
    });
    if (error) {
      logger.error('add_incident_comment فشل: ' + error.message, {
        component: 'IncidentCommentService', action: 'add',
      });
      throw new Error(incidentErrorMessage(error.message));
    }
    return String(data ?? '');
  }
}

export const incidentCommentService = new IncidentCommentService();
