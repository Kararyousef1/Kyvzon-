/**
 * ════════════════════════════════════════════════════════════════════════════
 *  TenantProviderService — مفاتيح المزوّدين الخاصة بكل شركة (BYOK)
 *
 *  النموذج (ب): كل شركة تُدخل مفاتيح مزوّديها (Resend/Twilio/Stripe/...) فترسل
 *  بهويتها وفاتورتها. الأسرار محميّة: تُحفظ عبر دوال SECURITY DEFINER، ولا
 *  تُقرأ من المتصفح إطلاقاً — الواجهة ترى فقط الحالة (is_configured + last4).
 *
 *  يغلّف دوال migration 0178:
 *    tenant_list_provider_status · tenant_set_provider_credential ·
 *    tenant_delete_provider_credential.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export type ProviderChannel = 'email' | 'sms' | 'payment' | 'enrichment' | 'streaming' | 'esignature' | 'social';

export interface ProviderStatus {
  id: string;
  channel: ProviderChannel;
  provider: string;
  config: Record<string, unknown>;
  isConfigured: boolean;   // هل المفتاح مضبوط؟ (بلا كشف قيمته)
  last4: string | null;    // آخر 4 أحرف للتعرّف
  isActive: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  updatedAt: string;
}

class TenantProviderService {
  /** حالة كل المزوّدين للشركة الحالية (بلا كشف الأسرار) */
  async listStatus(): Promise<ProviderStatus[]> {
    const { data, error } = await supabase.rpc('tenant_list_provider_status');
    if (error) throw new Error(error.message);
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      channel: r.channel as ProviderChannel,
      provider: String(r.provider),
      config: (r.config as Record<string, unknown>) || {},
      isConfigured: Boolean(r.is_configured),
      last4: (r.last4 as string) ?? null,
      isActive: Boolean(r.is_active),
      isVerified: Boolean(r.is_verified),
      verifiedAt: (r.verified_at as string) ?? null,
      updatedAt: String(r.updated_at),
    }));
  }

  /** حفظ/تحديث مفتاح مزوّد (لا يُرجع السرّ) */
  async setCredential(params: {
    channel: ProviderChannel; provider: string; secret: string; config?: Record<string, unknown>;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('tenant_set_provider_credential', {
      p_channel: params.channel, p_provider: params.provider,
      p_secret: params.secret, p_config: params.config ?? {},
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  /** فكّ ربط مزوّد (حذف المفتاح) */
  async deleteCredential(channel: ProviderChannel, provider: string): Promise<void> {
    const { error } = await supabase.rpc('tenant_delete_provider_credential', {
      p_channel: channel, p_provider: provider,
    });
    if (error) throw new Error(error.message);
  }
}

// ─── مرجع المزوّدين المدعومين لكل قناة (لواجهة الإعدادات) ─────────────────────
export interface ProviderMeta {
  channel: ProviderChannel;
  provider: string;
  label: string;
  secretLabel: string;       // اسم حقل السرّ في الواجهة
  configFields?: { key: string; label: string; placeholder?: string }[];
  hint: string;
}

export const SUPPORTED_PROVIDERS: ProviderMeta[] = [
  {
    channel: 'email', provider: 'resend', label: 'البريد الإلكتروني (Resend)',
    secretLabel: 'مفتاح Resend API (يبدأ بـ re_)',
    configFields: [{ key: 'from_email', label: 'بريد المُرسِل', placeholder: 'noreply@yourcompany.com' }],
    hint: 'أنشئ حساباً في resend.com وخذ مفتاح API. لإرسال من نطاقك، وثّقه في Resend أولاً.',
  },
  {
    channel: 'sms', provider: 'twilio', label: 'الرسائل (Twilio)',
    secretLabel: 'Twilio Auth Token',
    configFields: [
      { key: 'account_sid', label: 'Account SID', placeholder: 'AC...' },
      { key: 'sms_from', label: 'رقم المرسِل (SMS)', placeholder: '+1234567890' },
      { key: 'whatsapp_from', label: 'رقم واتساب', placeholder: 'whatsapp:+1234567890' },
    ],
    hint: 'أنشئ حساباً في twilio.com، اشترِ رقماً، وخذ Account SID و Auth Token.',
  },
  {
    channel: 'payment', provider: 'stripe', label: 'الدفع (Stripe)',
    secretLabel: 'Stripe Secret Key (يبدأ بـ sk_)',
    configFields: [{ key: 'webhook_secret', label: 'Webhook Signing Secret', placeholder: 'whsec_...' }],
    hint: 'أنشئ حساباً في stripe.com وخذ Secret key + إعداد webhook.',
  },
  {
    channel: 'enrichment', provider: 'clearbit', label: 'إثراء البيانات (Clearbit)',
    secretLabel: 'Clearbit API Key',
    hint: 'أنشئ حساباً في clearbit.com وخذ مفتاح API لإثراء بيانات الشركات.',
  },
  {
    channel: 'streaming', provider: 'zoom', label: 'البث (Zoom)',
    secretLabel: 'Zoom Client Secret',
    configFields: [
      { key: 'account_id', label: 'Account ID' },
      { key: 'client_id', label: 'Client ID' },
    ],
    hint: 'من marketplace.zoom.us أنشئ تطبيق Server-to-Server OAuth.',
  },
  {
    channel: 'esignature', provider: 'docusign', label: 'التوقيع الإلكتروني (DocuSign)',
    secretLabel: 'Private Key (RSA بصيغة PEM)',
    configFields: [
      { key: 'integration_key', label: 'Integration Key (Client ID)' },
      { key: 'user_id', label: 'User ID (API Username)' },
      { key: 'account_id', label: 'Account ID' },
      { key: 'base_uri', label: 'Base URI', placeholder: 'https://demo.docusign.net' },
      { key: 'oauth_base', label: 'OAuth Base', placeholder: 'account-d.docusign.com' },
    ],
    hint: 'من admin.docusign.com أنشئ تطبيق JWT، ولّد زوج مفاتيح RSA، وامنح موافقة impersonation.',
  },
  {
    channel: 'social', provider: 'meta', label: 'تواصل اجتماعي (Meta — فيسبوك/إنستغرام)',
    secretLabel: 'App Secret',
    configFields: [{ key: 'app_id', label: 'App ID', placeholder: 'معرّف تطبيق Meta' }],
    hint: 'من developers.facebook.com أنشئ تطبيقاً، وخذ App ID و App Secret، وأضف رابط إعادة التوجيه.',
  },
  {
    channel: 'social', provider: 'linkedin', label: 'تواصل اجتماعي (LinkedIn)',
    secretLabel: 'Client Secret',
    configFields: [{ key: 'app_id', label: 'Client ID', placeholder: 'معرّف تطبيق LinkedIn' }],
    hint: 'من linkedin.com/developers أنشئ تطبيقاً، وخذ Client ID و Client Secret، وأضف رابط إعادة التوجيه.',
  },
];

export const tenantProviderService = new TenantProviderService();
