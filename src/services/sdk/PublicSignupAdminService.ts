/**
 * PublicSignupAdminService — إدارة طلبات زوار صفحة الهبوط من بوابة المطور.
 */
import { supabase } from '../supabase/supabase';
import { getErrorMessage } from '../errors';

export type PublicSignupStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected' | 'archived';

export interface PublicSignupRequestRecord {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  country?: string | null;
  governorate?: string | null;
  intent_type: 'plan' | 'service' | 'review' | 'demo' | 'general';
  selected_plan?: string | null;
  selected_service?: string | null;
  rating?: number | null;
  review_text?: string | null;
  company_name?: string | null;
  status: PublicSignupStatus;
  source: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export const publicSignupAdminService = {
  async list(limit = 200): Promise<PublicSignupRequestRecord[]> {
    const { data, error } = await supabase
      .from('public_signup_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(getErrorMessage(error));
    return (data || []) as PublicSignupRequestRecord[];
  },

  async updateStatus(id: string, status: PublicSignupStatus): Promise<PublicSignupRequestRecord> {
    const { data, error } = await supabase
      .from('public_signup_requests')
      .update({ status })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(getErrorMessage(error));
    return data as PublicSignupRequestRecord;
  },
};
