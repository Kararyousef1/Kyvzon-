/** PublicSiteConfigService — إعدادات الموقع العام وصفحات الزوار */
import { settingsService } from './SettingsService';

export interface PublicInfoPageConfig {
  kind: string;
  title: string;
  desc: string;
  bullets: string[];
  ctaLabel?: string;
  ctaHref?: string;
  enabled?: boolean;
}

export interface LocalizedConfigText { ar: string; en: string; ku: string }

/** ثيم الموقع العام — ألوان وخطوط قابلة للتحكم من لوحة المطوّر */
export interface PublicSiteTheme {
  /** اللون الرئيسي (الهوية) */
  brandColor: string;
  /** لون داكن مساعد (للتدرّجات والنصوص على أبيض) */
  brandDark: string;
  /** لون تفاعل سماوي */
  accentSky: string;
  /** لون خلفية القسم البديل */
  bgAlt: string;
  /** لون النص العنواني */
  textHeading: string;
  /** لون نص الفقرات */
  textBody: string;
  /** الخط الرئيسي (اسم عائلة Google Font) */
  fontFamily: string;
  /** خط العناوين */
  headingFontFamily: string;
}

/** وسائط الهيرو والشعار */
export interface PublicSiteMedia {
  /** رابط الشعار (صورة) */
  logoUrl?: string;
  /** رابط صورة الهيرو (بديل للموك-أب) */
  heroImageUrl?: string;
  /** رابط فيديو تعريفي (YouTube/Vimeo/mp4) */
  heroVideoUrl?: string;
}

/** نصوص الهيرو والأقسام الرئيسية القابلة للتحكم */
export interface PublicSiteContent {
  heroBadge?: LocalizedConfigText;
  heroTitle1?: LocalizedConfigText;
  heroTitle2?: LocalizedConfigText;
  heroDesc?: LocalizedConfigText;
}

export interface PublicPlanConfig {
  id: string;
  name: LocalizedConfigText;
  range: LocalizedConfigText;
  desc: LocalizedConfigText;
  features: Record<'ar' | 'en' | 'ku', string[]>;
  highlight?: boolean;
  badge?: LocalizedConfigText | null;
  enabled?: boolean;
  order?: number;
}

export interface PublicServiceConfig {
  id: string;
  iconKey?: string;
  color: string;
  title: LocalizedConfigText;
  desc: LocalizedConfigText;
  promo: LocalizedConfigText;
  badge: LocalizedConfigText;
  enabled?: boolean;
  order?: number;
}

export interface PublicPortalConfig {
  id: string;
  iconKey?: string;
  color: string;
  gradient?: string;
  title: LocalizedConfigText;
  desc: LocalizedConfigText;
  features: Record<'ar' | 'en' | 'ku', string[]>;
  enabled?: boolean;
  order?: number;
}

export interface PublicSiteConfig {
  signupEnabled: boolean;
  portalExplorerEnabled: boolean;
  hideDeveloperPortal: boolean;
  defaultSignupIntent: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  supportEmail: string;
  supportPhone: string;
  pages: PublicInfoPageConfig[];
  plans?: PublicPlanConfig[];
  services?: PublicServiceConfig[];
  portals?: PublicPortalConfig[];
  theme?: PublicSiteTheme;
  media?: PublicSiteMedia;
  content?: PublicSiteContent;
  updatedAt?: string;
}

/** الثيم الافتراضي — يطابق قيم styles.css الحالية */
export const DEFAULT_SITE_THEME: PublicSiteTheme = {
  brandColor: '#1466d8',
  brandDark: '#0e4fac',
  accentSky: '#38a6f0',
  bgAlt: '#f7f9fc',
  textHeading: '#0a1628',
  textBody: '#3d4b60',
  fontFamily: 'IBM Plex Sans Arabic',
  headingFontFamily: 'Cairo',
};

export const DEFAULT_PUBLIC_SITE_CONFIG: PublicSiteConfig = {
  signupEnabled: true,
  portalExplorerEnabled: true,
  hideDeveloperPortal: true,
  defaultSignupIntent: 'demo',
  primaryCtaLabel: 'ابدأ مجانًا',
  primaryCtaHref: '/signup?intent=demo',
  supportEmail: 'hello@kyvzon.com',
  supportPhone: '+964 XXX XXX XXXX',
  plans: [],
  services: [],
  portals: [],
  theme: DEFAULT_SITE_THEME,
  media: {},
  content: {},
  pages: [
    { kind: 'about', title: 'من نحن', desc: 'KYVZON منصة SaaS عراقية لبناء بوابات عمل احترافية للشركات والمؤسسات.', bullets: ['منصة متعددة الشركات', 'تركيز على HR والتشغيل', 'مصممة للعراق والمنطقة'], enabled: true },
    { kind: 'careers', title: 'الوظائف', desc: 'انضم إلى فريق Kyvzon لبناء مستقبل منصات SaaS في العراق والمنطقة.', bullets: ['هندسة برمجيات', 'دعم فني', 'مبيعات وشراكات', 'تصميم وتجربة مستخدم'], enabled: true },
    { kind: 'blog', title: 'المدونة', desc: 'مقالات ورؤى حول التحول الرقمي، الموارد البشرية، وأنظمة SaaS.', bullets: ['مقالات تقنية', 'إدارة الموارد البشرية', 'دراسات حالة', 'تحديثات المنتج'], enabled: true },
    { kind: 'support', title: 'الدعم الفني', desc: 'نحن هنا لمساعدة عملاء KYVZON في التشغيل والإعداد وحل المشاكل.', bullets: ['دعم عبر البريد', 'دعم أولوية للخطط المتقدمة', 'مساعدة في الإعداد', 'قاعدة معرفة مستقبلية'], enabled: true },
    { kind: 'status', title: 'حالة النظام', desc: 'تابع حالة خدمات KYVZON الأساسية والتشغيلية.', bullets: ['تطبيق الويب: يعمل', 'المصادقة: تعمل', 'الإشعارات: تعمل', 'المزامنة التقنية: حسب إعداد العميل'], enabled: true },
    { kind: 'privacy', title: 'سياسة الخصوصية', desc: 'نلتزم بحماية بيانات العملاء والمستخدمين وفق أفضل ممارسات SaaS.', bullets: ['عزل بيانات الشركات', 'عدم بيع البيانات', 'تشفير الاتصالات', 'صلاحيات وصول محددة'], enabled: true },
    { kind: 'terms', title: 'شروط الاستخدام', desc: 'توضح هذه الصفحة شروط استخدام منصة KYVZON وخدماتها.', bullets: ['استخدام مشروع ومصرح', 'احترام حقوق الملكية', 'الالتزام بسياسات الأمان', 'شروط الاشتراك حسب العقد'], enabled: true },
    { kind: 'security', title: 'الأمان', desc: 'KYVZON تعتمد مبادئ أمان قوية تشمل RLS وعزل الشركات وطبقة صلاحيات.', bullets: ['Multi-Tenant Isolation', 'Row Level Security', 'SDK Boundary', 'سجلات تدقيق وأحداث أمنية'], enabled: true },
    { kind: 'contact', title: 'تواصل معنا', desc: 'تواصل مع فريق KYVZON للاستفسارات والشراكات وطلبات العروض.', bullets: ['hello@kyvzon.com', 'بغداد، العراق', 'طلبات العروض', 'الشراكات والدعم'], enabled: true },
  ],
};

export const publicSiteConfigService = {
  async getConfig(): Promise<PublicSiteConfig> {
    // 1) المسار العام: دالة آمنة تعمل للزوّار (anon) — تُرجع public_site_config فقط
    try {
      const { supabase } = await import('../supabase/supabase');
      const { data, error } = await supabase.rpc('get_public_site_config');
      if (!error && data && typeof data === 'object') {
        return { ...DEFAULT_PUBLIC_SITE_CONFIG, ...(data as Partial<PublicSiteConfig>) };
      }
    } catch { /* fallback أدناه */ }

    // 2) احتياطي: القراءة المباشرة (تعمل للأدمن؛ تفشل بهدوء للزوّار)
    try {
      const general = await settingsService.findGeneralSettings();
      return { ...DEFAULT_PUBLIC_SITE_CONFIG, ...((general?.public_site_config || {}) as Partial<PublicSiteConfig>) };
    } catch {
      return DEFAULT_PUBLIC_SITE_CONFIG;
    }
  },
  async updateConfig(config: PublicSiteConfig): Promise<void> {
    const general = (await settingsService.findGeneralSettings()) || {};
    await settingsService.updateGeneralSettings({ ...general, public_site_config: { ...config, updatedAt: new Date().toISOString() } });
  },
};
