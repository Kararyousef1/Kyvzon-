/**
 * i18n.ts — الترجمات الثلاثية (عربي / إنجليزي / كردي)
 * كل نصوص الواجهة الثابتة (غير المرتبطة ببيانات مثل البوابات والخطط) تعيش هنا.
 */
import type { Lang } from './types';

export const TEXTS: Record<string, Record<Lang, string>> = {
  // ── Nav ──────────────────────────────────────────────────────
  nav_home:     { ar: 'الرئيسية',   en: 'Home',        ku: 'ماڵەوە' },
  nav_portals:  { ar: 'البوابات',   en: 'Portals',     ku: 'دەروازەکان' },
  nav_services: { ar: 'الخدمات',    en: 'Services',    ku: 'خزمەتگوزاریەکان' },
  nav_pricing:  { ar: 'الأسعار',    en: 'Pricing',     ku: 'نرخەکان' },
  nav_faq:      { ar: 'الأسئلة الشائعة', en: 'FAQ',     ku: 'پرسیارەکان' },
  nav_contact:  { ar: 'تواصل',      en: 'Contact',     ku: 'پەیوەندی' },
  login:        { ar: 'دخول النظام', en: 'Login',       ku: 'چوونەژوورەوە' },
  skip_to_content: { ar: 'تخطَّ إلى المحتوى', en: 'Skip to content', ku: 'بازدان بۆ ناوەڕۆک' },

  // ── Hero ─────────────────────────────────────────────────────
  hero_badge:   { ar: 'نظام ERP سحابي — صُنع في العراق للعالم', en: 'Cloud ERP System — Made in Iraq for the World', ku: 'سیستەمی ERP ئەبری — لە عێراق دروستکراوە بۆ جیهان' },
  hero_h1_1:    { ar: 'أدر شركتك',  en: 'Run Your',    ku: 'کارگەیت' },
  hero_h1_2:    { ar: 'بذكاء حقيقي', en: 'Business Smarter', ku: 'بە زیرەکی ئەمپڕیز کار بکە' },
  hero_desc:    { ar: 'KYVZON منصة SaaS متكاملة لإدارة المؤسسات: بوابات الموظف وHR والإدارة والمدير والمشرف والحركة والتواصل والتقنية، مع تحكم مركزي بالاشتراكات وتفعيل البوابات لكل شركة.', en: 'KYVZON is a complete SaaS platform for organizations: employee, HR, admin, manager, supervisor, movement, communication and tech portals, with centralized subscription and portal activation control.', ku: 'KYVZON پلاتفۆرمێکی SaaS ـی تەواوە بۆ دامەزراوەکان: کارمەند، HR، بەڕێوەبەرایەتی، جووڵە، پەیوەندی و تەکنیک، لەگەڵ کۆنترۆڵی ئەبۆنمەنت.' },
  hero_cta1:    { ar: 'ابدأ مجاناً', en: 'Start Free',  ku: 'بەبێ پارە دەستپێبکە' },
  hero_cta2:    { ar: 'شاهد الديمو', en: 'Watch Demo',  ku: 'دیمۆ ببینە' },
  hero_mockup_live: { ar: 'مباشر', en: 'Live', ku: 'ڕاستەوخۆ' },

  // ── Social proof ────────────────────────────────────────────
  social_label: { ar: 'موثوقية', en: 'Trust', ku: 'متمانە' },
  social_title: { ar: 'يثق بنا فريق العمل في مؤسسات من قطاعات مختلفة', en: 'Trusted by teams across every industry', ku: 'تیمەکانی کار لە دامەزراوەکانی جۆراوجۆر متمانەمان پێدەکەن' },
  social_sub:   { ar: 'نساعد فرق العمليات والموارد البشرية على العمل بكفاءة أعلى، أياً كان مجال عملها', en: 'We help operations and HR teams work more efficiently, whatever their industry', ku: 'یارمەتی تیمەکانی کردار و مرۆیی دەدەین بۆ کارکردنی باشتر' },

  // ── Portals ──────────────────────────────────────────────────
  portals_label: { ar: 'البوابات', en: 'Portals', ku: 'دەروازەکان' },
  portals_title: { ar: 'بوابات متكاملة لكل دور داخل مؤسستك', en: 'Integrated portals for every role in your organization', ku: 'دەروازەی یەکگرتوو بۆ هەر ڕۆڵێک' },
  portals_sub:  { ar: 'فعّل ما تحتاجه شركتك فقط من بوابة المطور حسب الخطة والاشتراك — وكل بوابة تعمل بتكامل مع الأخرى.', en: 'Enable only what your company needs from the developer control plane according to plan and subscription — all portals work together.', ku: 'تەنها ئەوەی پێویستە چالاک بکە بەپێی پلان و ئەبۆنمەنت.' },
  portals_key_features: { ar: 'الميزات الرئيسية', en: 'Key Features', ku: 'تایبەتمەندییەکانی سەرەکی' },
  portals_explore: { ar: 'استكشف البوابة', en: 'Explore Portal', ku: 'دەروازەکە بگەڕێنەوە' },

  // ── Screenshots ──────────────────────────────────────────────
  screens_label: { ar: 'المنتج', en: 'Product', ku: 'بەرهەم' },
  screens_title: { ar: 'شاهد النظام من الداخل', en: 'See the platform in action', ku: 'سیستەمەکە لە ناوەوە ببینە' },
  screens_sub:   { ar: 'جولة سريعة داخل الشاشات التي يستخدمها فريقك يومياً', en: 'A quick tour of the screens your team uses every day', ku: 'گەشتێکی خێرا بەناو ئەو شاشانەی تیمەکەت ڕۆژانە بەکاریان دەهێنێت' },

  // ── Why KYVZON ───────────────────────────────────────────────
  why_label: { ar: 'لماذا KYVZON؟', en: 'Why KYVZON?', ku: 'بۆچی KYVZON؟' },
  why_title: { ar: 'نظام ERP مصمم للسوق العراقي — بمعايير عالمية', en: 'ERP System Designed for the Iraqi Market — with Global Standards', ku: 'سیستەمی ERP دیزاینکراو بۆ بازاڕی عێراق — بە ستانداردی جیهانی' },
  why_desc:  { ar: 'نحن نفهم تحديات الشركات العراقية: اللغة، العملة، الأنظمة المحلية. KYVZON بُني خصيصاً لهذه البيئة، دون أن يتنازل عن معايير الأمان والأداء العالمية.', en: 'We understand Iraqi business challenges: language, currency, local systems. KYVZON was built specifically for this environment, without compromising on global security and performance standards.', ku: 'ئێمە ئاگاداری ئاستەنگەکانی کۆمپانیاکانی عێراقین: زمان، دراو، سیستەمی ناوخۆیی. KYVZON بۆ ئەم ژینگەیە دروستکراوە.' },
  why_kpi_label: { ar: 'بالأرقام', en: 'By the numbers', ku: 'بە ژمارە' },

  // ── Testimonials ─────────────────────────────────────────────
  testi_label: { ar: 'آراء العملاء', en: 'Testimonials', ku: 'ڕاوبۆچوونی کڕیاران' },
  testi_title: { ar: 'ماذا يقول من يستخدم KYVZON يومياً', en: 'What teams using KYVZON say', ku: 'ئەوانەی KYVZON بەکاردەهێنن چی دەڵێن' },
  testi_sub:   { ar: 'تجارب حقيقية من فرق تستخدم المنصة لإدارة عملياتها اليومية', en: 'Real experiences from teams running their day-to-day operations on the platform', ku: 'ئەزموونی ڕاستەقینە لە تیمەکانی بەکارهێنەری پلاتفۆرمەکە' },

  // ── Pricing ──────────────────────────────────────────────────
  pricing_label: { ar: 'الأسعار', en: 'Pricing', ku: 'نرخەکان' },
  pricing_title: { ar: 'خطط SaaS واضحة حسب البوابات والحدود', en: 'Clear SaaS plans by portals and limits', ku: 'پلانی SaaS بەپێی دەروازە و سنوورەکان' },
  pricing_sub:  { ar: 'ابدأ بـ Basic ثم توسّع إلى Professional أو Enterprise حسب عدد الموظفين والفروع وأجهزة البصمة والبوابات المطلوبة.', en: 'Start with Basic and scale to Professional or Enterprise by employees, branches, biometric devices and required portals.', ku: 'بە Basic دەستپێبکە و بەپێی کارمەند، لق، ئامێر و دەروازەکان فراوانی بکە.' },
  pricing_custom: { ar: 'السعر عند الطلب', en: 'Custom pricing', ku: 'نرخ بەپێی داواکاری' },
  pricing_cta_default: { ar: 'اطلب السعر', en: 'Request Pricing', ku: 'داوای نرخ بکە' },
  pricing_cta_extra: { ar: 'تواصل معنا', en: 'Contact Us', ku: 'پەیوەندیمان پێوە بکە' },
  pricing_compare_toggle: { ar: 'قارن بين جميع الخطط بالتفصيل', en: 'Compare all plans in detail', ku: 'بەراوردی هەموو پلانەکان بکە' },
  pricing_compare_hide: { ar: 'إخفاء المقارنة', en: 'Hide comparison', ku: 'بەراورد بشارەوە' },
  pricing_guarantee_1: { ar: 'بدون التزام طويل الأمد', en: 'No long-term contract', ku: 'بێ پابەندی درێژخایەن' },
  pricing_guarantee_2: { ar: 'ترقية أو تخفيض في أي وقت', en: 'Upgrade or downgrade anytime', ku: 'بەرزکردنەوە یان دابەزاندن لە هەر کاتێک' },
  pricing_guarantee_3: { ar: 'إعداد ودعم مجاني عند الاشتراك', en: 'Free onboarding & setup support', ku: 'یارمەتی دامەزراندنی خۆراوی' },
  pricing_guarantee_4: { ar: 'بياناتك قابلة للتصدير دائماً', en: 'Your data is always exportable', ku: 'داتاکانت هەمیشە دەردەهێنرێن' },
  pricing_promo_title: { ar: 'عرض خاص: اشترك واحصل على موقعك الإلكتروني مجاناً', en: 'Special Offer: Subscribe & Get Your Website Free', ku: 'ئۆفەری تایبەت: بەشداری بکە و مالپەڕت بە خۆراو وەربگرە' },
  pricing_promo_sub: { ar: 'مع خطة MEDIUM أو أعلى', en: 'With MEDIUM plan or higher', ku: 'لەگەڵ پلانی MEDIUM یان بەرزتر' },
  pricing_promo_cta: { ar: 'احصل على العرض', en: 'Claim Offer', ku: 'ئۆفەرەکە وەربگرە' },

  // ── Services ─────────────────────────────────────────────────
  services_label: { ar: 'الخدمات', en: 'Services', ku: 'خزمەتگوزاریەکان' },
  services_title: { ar: 'خدمات إضافية متكاملة', en: 'Additional Integrated Services', ku: 'خزمەتگوزارییە زیادەکانی یەکگرتوو' },
  services_sub: { ar: 'وسّع نطاق KYVZON ليغطي احتياجاتك الرقمية بالكامل', en: 'Extend KYVZON to cover your full digital footprint', ku: 'KYVZON فراوان بکە بۆ پۆشینی هەموو پێداویستییە دیجیتاڵییەکانت' },

  // ── FAQ ──────────────────────────────────────────────────────
  faq_label: { ar: 'الأسئلة الشائعة', en: 'FAQ', ku: 'پرسیارە باوەکان' },
  faq_title: { ar: 'أسئلة يتكرر سؤالنا عنها', en: 'Questions we get asked a lot', ku: 'پرسیارە دووبارەبووەکان' },
  faq_sub:   { ar: 'لم تجد إجابتك؟ فريقنا جاهز للرد على أي استفسار', en: 'Didn\u2019t find your answer? Our team is ready to help', ku: 'وەڵامەکەت نەدۆزیەوە؟ تیمەکەمان ئامادەیە' },
  faq_still_question: { ar: 'ما زال لديك سؤال؟', en: 'Still have a question?', ku: 'هێشتا پرسیارت هەیە؟' },
  faq_talk_to_us: { ar: 'تحدث مع فريقنا', en: 'Talk to our team', ku: 'قسە لەگەڵ تیمەکەمان بکە' },

  // ── CTA section ──────────────────────────────────────────────
  cta_title:    { ar: 'جاهز لتحويل عملك؟', en: 'Ready to Transform Your Business?', ku: 'ئامادەیت کارەکەت بگۆڕیت؟' },
  cta_sub:      { ar: 'انضم إلى الشركات الرائدة التي تثق بـ KYVZON لإدارة أعمالها', en: 'Join the leading companies that trust KYVZON to manage their business', ku: 'بەشداری کۆمپانیا پێشرەوەکان بکە کە پشت بە KYVZON دەبەستن' },
  cta_start_now: { ar: 'ابدأ مجاناً الآن', en: 'Start Free Now', ku: 'ئێستا بەبێ پارە دەستپێبکە' },
  cta_talk_expert: { ar: 'تحدث مع خبير', en: 'Talk to an Expert', ku: 'لەگەڵ شارەزا قسە بکە' },
  cta_trust_row: { ar: 'بدون بطاقة ائتمان · إعداد خلال أقل من ٢٤ ساعة · إلغاء في أي وقت', en: 'No credit card · Live in under 24 hours · Cancel anytime', ku: 'بێ کارتی بانکی · ئامادەکاری لە کەمتر لە ٢٤ کاتژمێر' },

  // ── Contact ──────────────────────────────────────────────────
  contact_label: { ar: 'تواصل', en: 'Contact', ku: 'پەیوەندی' },
  contact_title: { ar: 'نحن هنا لمساعدتك', en: 'We Are Here to Help', ku: 'ئێمە لێرەین بۆ یارمەتیت' },

  // ── Footer ───────────────────────────────────────────────────
  footer_tagline: { ar: 'منصة ERP سحابية متكاملة، صُنعت لتُدار بها مؤسسات العراق والمنطقة بثقة.', en: 'A complete cloud ERP platform, built to run organizations across Iraq and the region with confidence.', ku: 'پلاتفۆرمێکی ERP ئەبری تەواو، بۆ بەڕێوەبردنی دامەزراوەکانی عێراق دروستکراوە.' },
  footer_col_product: { ar: 'المنتج', en: 'Product', ku: 'بەرهەم' },
  footer_col_company: { ar: 'الشركة', en: 'Company', ku: 'کۆمپانیا' },
  footer_col_resources: { ar: 'مصادر', en: 'Resources', ku: 'سەرچاوەکان' },
  footer_col_legal: { ar: 'قانوني', en: 'Legal', ku: 'یاسایی' },
  footer_about: { ar: 'من نحن', en: 'About Us', ku: 'دەربارەمان' },
  footer_careers: { ar: 'الوظائف', en: 'Careers', ku: 'کارەکان' },
  footer_blog: { ar: 'المدونة', en: 'Blog', ku: 'بلۆگ' },
  footer_contact: { ar: 'تواصل معنا', en: 'Contact Us', ku: 'پەیوەندیمان پێوە بکە' },
  footer_faq: { ar: 'الأسئلة الشائعة', en: 'FAQ', ku: 'پرسیارە باوەکان' },
  footer_support: { ar: 'الدعم الفني', en: 'Support', ku: 'پشتگیری تەکنیکی' },
  footer_pricing: { ar: 'الأسعار', en: 'Pricing', ku: 'نرخەکان' },
  footer_status: { ar: 'حالة النظام', en: 'System Status', ku: 'دۆخی سیستەم' },
  footer_privacy: { ar: 'سياسة الخصوصية', en: 'Privacy Policy', ku: 'سیاسەتی نهێنی' },
  footer_terms: { ar: 'شروط الاستخدام', en: 'Terms of Service', ku: 'مەرجەکانی بەکارهێنان' },
  footer_security: { ar: 'الأمان', en: 'Security', ku: 'ئەمنییەت' },
  footer_rights: { ar: 'جميع الحقوق محفوظة', en: 'All Rights Reserved', ku: 'هەموو مافەکان پارێزراون' },
  footer_made_in: { ar: 'صُنع بكل فخر في العراق', en: 'Proudly made in Iraq', ku: 'بە شانازییەوە لە عێراق دروستکراوە' },
};

export const t = (key: string, lang: Lang): string => TEXTS[key]?.[lang] ?? key;
