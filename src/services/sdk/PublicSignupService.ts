/**
 * PublicSignupService — طلبات التسجيل العامة من صفحة الهبوط.
 * يحفظ اختيار الخطة/الخدمة/التقييم بعد تحقق OTP وإنشاء جلسة Auth.
 */
import { supabase } from '../supabase/supabase';
import { getErrorMessage } from '../errors';

export type PublicSignupIntentType = 'plan' | 'service' | 'review' | 'demo' | 'general';

export interface PublicSignupRequestInput {
  email: string;
  full_name: string;
  phone?: string;
  country?: string;
  governorate?: string;
  intent_type: PublicSignupIntentType;
  selected_plan?: string;
  selected_service?: string;
  rating?: number;
  review_text?: string;
  company_name?: string;
  metadata?: Record<string, unknown>;
}

export const publicSignupService = {
  async createRequest(input: PublicSignupRequestInput): Promise<void> {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw new Error(getErrorMessage(userError));
    if (!user?.id) throw new Error('يجب التحقق من البريد الإلكتروني أولاً');

    const { error } = await supabase
      .from('public_signup_requests')
      .insert({
        user_id: user.id,
        email: input.email,
        full_name: input.full_name,
        phone: input.phone || null,
        country: input.country || null,
        governorate: input.governorate || null,
        intent_type: input.intent_type,
        selected_plan: input.selected_plan || null,
        selected_service: input.selected_service || null,
        rating: input.rating || null,
        review_text: input.review_text || null,
        company_name: input.company_name || null,
        metadata: input.metadata || {},
      });

    if (error) throw new Error(getErrorMessage(error));
  },
};
