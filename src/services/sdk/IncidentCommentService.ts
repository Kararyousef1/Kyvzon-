/**
 * ════════════════════════════════════════════════════════════════
 *  IncidentCommentService - خدمة تعليقات البلاغات
 *  Domain: تستخدم supabase مباشرة للاستعلامات المعقدة (join)
 *  مع BaseService للـ CRUD الأساسي
 * ════════════════════════════════════════════════════════════════
 */

import { BaseService } from './BaseService';
import type { IncidentCommentRecord } from '../../shared/types/sdk';
import { supabase } from '../supabase/supabase';

export interface CommentDetail {
  id: string;
  incident_id: string;
  user_id: string;
  text: string;
  is_internal: boolean;
  created_at: string;
  user_name?: string;
  user_role?: string;
}

interface CommentRow {
  id: string;
  incident_id: string;
  user_id: string;
  text: string;
  is_internal: boolean;
  created_at: string;
  profiles?: { full_name?: string; role?: string } | null;
}

class IncidentCommentService extends BaseService<IncidentCommentRecord> {
  constructor() {
    super('incident_comments');
  }

  /** جلب التعليقات لبلاغ معين (مع معلومات المستخدم) */
  async findCommentsByIncident(incidentId: string): Promise<CommentDetail[]> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('id, incident_id, user_id, text, is_internal, created_at, profiles(full_name, role)')
        .eq('incident_id', incidentId)
        .order('created_at', { ascending: true });

      if (error) return [];

      return ((data as CommentRow[]) || []).map((comment) => ({
        id: comment.id,
        incident_id: comment.incident_id,
        user_id: comment.user_id,
        text: comment.text,
        is_internal: comment.is_internal,
        created_at: comment.created_at,
        user_name: comment.profiles?.full_name || 'مستخدم',
        user_role: comment.profiles?.role,
      }));
    } catch {
      return [];
    }
  }

  /** إضافة تعليق جديد */
  async addComment(data: {
    incident_id: string;
    user_id: string;
    text: string;
    is_internal?: boolean;
  }): Promise<CommentDetail | null> {
    try {
      const { data: result, error } = await supabase
        .from(this.tableName)
        .insert({
          incident_id: data.incident_id,
          user_id: data.user_id,
          text: data.text,
          is_internal: data.is_internal || false,
          created_at: new Date().toISOString(),
        })
        .select('id, incident_id, user_id, text, is_internal, created_at, profiles(full_name, role)')
        .single();

      if (error) return null;

      const row = result as CommentRow;
      return {
        id: row.id,
        incident_id: row.incident_id,
        user_id: row.user_id,
        text: row.text,
        is_internal: row.is_internal,
        created_at: row.created_at,
        user_name: row.profiles?.full_name || 'مستخدم',
        user_role: row.profiles?.role,
      };
    } catch {
      return null;
    }
  }

  /** حذف تعليق */
  async deleteComment(commentId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from(this.tableName).delete().eq('id', commentId);
      return !error;
    } catch { return false; }
  }

  /** تحديث تعليق */
  async updateComment(commentId: string, text: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from(this.tableName)
        .update({ text, updated_at: new Date().toISOString() })
        .eq('id', commentId);
      return !error;
    } catch { return false; }
  }
}

export const incidentCommentService = new IncidentCommentService();
