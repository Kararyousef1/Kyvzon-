/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PublicInfoPage — صفحات المعلومات العامة (من نحن / الوظائف / الأمان / ...)
 *  صفحة كاملة بثيم فاتح: شريط علوي → Hero → محتوى غني مخصّص لكل نوع → فوتر كامل.
 *  المحتوى قابل للتخصيص عبر publicSiteConfig (title/desc/bullets/cta).
 * ════════════════════════════════════════════════════════════════════════════
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, FileText, Headphones, Lock, Mail, ShieldCheck, Signal, Users,
  CheckCircle, ArrowRight, MapPin, Phone, type LucideIcon,
} from 'lucide-react';
import '../landing/styles.css';
import { LangProvider } from '../landing/LangContext';
import { useThemeInjector } from '../landing/ThemeInjector';
import { Footer } from '../landing/sections/Footer';
import { ContactFab } from '../landing/sections/ContactFab';
import { publicSiteConfigService, type PublicInfoPageConfig, type PublicSiteConfig } from '../../../services/sdk';

type PageKind = 'about' | 'careers' | 'blog' | 'support' | 'status' | 'privacy' | 'terms' | 'security' | 'contact';

interface Meta {
  title: string;
  desc: string;
  icon: LucideIcon;
  bullets: string[];
  color: string;
  intro: string;         // فقرة تمهيدية أطول
  bulletsTitle: string;  // عنوان قسم النقاط
}

const META: Record<PageKind, Meta> = {
  about: {
    title: 'من نحن', color: '#0c8de7', icon: Users,
    desc: 'KYVZON منصة SaaS عراقية لبناء بوابات عمل احترافية للشركات والمؤسسات.',
    intro: 'وُلدت Kyvzon من إيمان بأن مؤسسات العراق والمنطقة تستحق منصة أعمال متكاملة بمستوى عالمي — بلغتها، وبفهم عميق لسياق سوقها. نجمع كل ما تحتاجه شركتك (HR، تشغيل، مالية، مبيعات، تسويق) في نظام واحد موحّد.',
    bulletsTitle: 'ما يميّزنا', bullets: ['منصة متعددة الشركات (Multi-Tenant)', 'تركيز على HR والتشغيل', 'مصممة للعراق والمنطقة', 'دعم عربي كامل'],
  },
  careers: {
    title: 'الوظائف', color: '#7c3aed', icon: Briefcase,
    desc: 'انضم إلى فريق Kyvzon لبناء مستقبل منصات SaaS في العراق والمنطقة.',
    intro: 'نبحث دائماً عن مواهب شغوفة تريد أن تصنع فرقاً حقيقياً. في Kyvzon ستعمل على منتج يستخدمه آلاف الموظفين يومياً، وتساهم في نقلة رقمية لمؤسسات المنطقة.',
    bulletsTitle: 'مجالات نبحث فيها', bullets: ['هندسة برمجيات (Frontend / Backend)', 'دعم فني وعناية بالعملاء', 'مبيعات وشراكات', 'تصميم وتجربة مستخدم'],
  },
  blog: {
    title: 'المدونة', color: '#0891b2', icon: FileText,
    desc: 'مقالات ورؤى حول التحول الرقمي، الموارد البشرية، وأنظمة SaaS.',
    intro: 'نشارك خبرتنا ورؤانا حول بناء المؤسسات الرقمية، أفضل ممارسات الموارد البشرية، وكيف تحوّل التقنية طريقة عمل الشركات في المنطقة.',
    bulletsTitle: 'مواضيع نكتب عنها', bullets: ['مقالات تقنية', 'إدارة الموارد البشرية', 'دراسات حالة', 'تحديثات المنتج'],
  },
  support: {
    title: 'الدعم الفني', color: '#16a34a', icon: Headphones,
    desc: 'نحن هنا لمساعدة عملاء KYVZON في التشغيل والإعداد وحل المشاكل.',
    intro: 'فريق دعم عربي يفهم سياقك ويرافقك خطوة بخطوة — من الإعداد الأول حتى تشغيلك الكامل. لا تُترك وحدك أبداً.',
    bulletsTitle: 'كيف ندعمك', bullets: ['دعم عبر البريد والواتساب', 'دعم أولوية للخطط المتقدمة', 'مساعدة كاملة في الإعداد', 'قاعدة معرفة ومقالات إرشادية'],
  },
  status: {
    title: 'حالة النظام', color: '#16a34a', icon: Signal,
    desc: 'تابع حالة خدمات KYVZON الأساسية والتشغيلية لحظياً.',
    intro: 'الشفافية جزء من التزامنا. هنا تتابع حالة كل خدمة من خدمات المنصة في الوقت الفعلي.',
    bulletsTitle: 'حالة الخدمات', bullets: ['تطبيق الويب: يعمل', 'المصادقة: تعمل', 'الإشعارات: تعمل', 'المزامنة التقنية: حسب إعداد العميل'],
  },
  privacy: {
    title: 'سياسة الخصوصية', color: '#0c8de7', icon: Lock,
    desc: 'نلتزم بحماية بيانات العملاء والمستخدمين وفق أفضل ممارسات SaaS.',
    intro: 'خصوصية بياناتك ليست خياراً بل أساس. نطبّق أعلى معايير الحماية، ولا نبيع بياناتك أبداً، ونمنحك تحكّماً كاملاً بها.',
    bulletsTitle: 'التزاماتنا', bullets: ['عزل بيانات كل شركة على حدة', 'عدم بيع البيانات إطلاقاً', 'تشفير كامل للاتصالات', 'صلاحيات وصول دقيقة ومحدّدة'],
  },
  terms: {
    title: 'شروط الاستخدام', color: '#64748b', icon: FileText,
    desc: 'توضح هذه الصفحة شروط استخدام منصة KYVZON وخدماتها.',
    intro: 'باستخدامك لمنصة Kyvzon، فإنك توافق على الشروط التالية التي تنظّم العلاقة بيننا وتضمن تجربة عادلة وآمنة للجميع.',
    bulletsTitle: 'أبرز الشروط', bullets: ['استخدام مشروع ومصرّح به', 'احترام حقوق الملكية الفكرية', 'الالتزام بسياسات الأمان', 'شروط الاشتراك حسب العقد'],
  },
  security: {
    title: 'الأمان', color: '#dc2626', icon: ShieldCheck,
    desc: 'KYVZON تعتمد مبادئ أمان قوية تشمل عزل الشركات وطبقة صلاحيات صارمة.',
    intro: 'الأمان مبنيّ في صميم Kyvzon، لا مضافاً لاحقاً. من عزل بيانات كل شركة على مستوى قاعدة البيانات، إلى سجلات التدقيق الكاملة — بياناتك محميّة بطبقات متعددة.',
    bulletsTitle: 'طبقات الحماية', bullets: ['عزل كامل بين الشركات (Multi-Tenant Isolation)', 'حماية على مستوى الصف (Row Level Security)', 'حدود SDK صارمة', 'سجلات تدقيق وأحداث أمنية'],
  },
  contact: {
    title: 'تواصل معنا', color: '#0c8de7', icon: Mail,
    desc: 'تواصل مع فريق KYVZON للاستفسارات والشراكات وطلبات العروض.',
    intro: 'نحب أن نسمع منك. سواء كان استفساراً، طلب عرض، أو فرصة شراكة — فريقنا جاهز للرد بسرعة.',
    bulletsTitle: 'طرق التواصل', bullets: ['hello@kyvzon.com', 'بغداد، العراق', 'طلبات العروض التجارية', 'الشراكات والدعم'],
  },
};

function InfoContent({ kind }: { kind: PageKind }) {
  const navigate = useNavigate();
  const [custom, setCustom] = useState<PublicInfoPageConfig | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig | null>(null);
  useThemeInjector(publicConfig?.theme);
  useEffect(() => {
    window.scrollTo(0, 0);
    publicSiteConfigService.getConfig().then((cfg) => {
      setPublicConfig(cfg);
      const page = cfg.pages.find((p) => p.kind === kind && p.enabled !== false);
      if (page) setCustom(page);
    }).catch(() => undefined);
  }, [kind]);

  const base = META[kind];
  const meta = custom ? { ...base, ...custom } : base;
  const Icon = base.icon;
  const color = base.color;
  const soft = `${color}14`;
  const isContact = kind === 'contact';
  const email = publicConfig?.supportEmail || 'hello@kyvzon.com';
  const phone = publicConfig?.supportPhone || '';

  return (
    <div className="kv-root min-h-screen" dir="rtl">
      {/* ─── شريط علوي ─── */}
      <div className="glass-header" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between" style={{ height: 64 }}>
          <button onClick={() => navigate('/')} className="font-black text-xl" style={{ color: 'var(--kv-text-hi)' }}>
            Kyv<span style={{ color: 'var(--kv-accent-1)' }}>zon</span>
          </button>
          <button onClick={() => navigate('/')} className="btn-outline !py-2 !px-4 text-sm">
            <ArrowRight size={16} /> العودة للرئيسية
          </button>
        </div>
      </div>

      <main>
        {/* ─── Hero ─── */}
        <section className="hero-grid" style={{ padding: '4.5rem 0' }}>
          <div className="max-w-4xl mx-auto px-6 text-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: soft }}>
              <Icon size={32} style={{ color }} />
            </div>
            <h1 className="font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(2rem, 4vw, 3rem)' }}>{meta.title}</h1>
            <p className="mt-4 text-lg mx-auto" style={{ color: 'var(--kv-text-body)', maxWidth: '38rem' }}>{meta.desc}</p>
          </div>
        </section>

        {/* ─── فقرة تمهيدية ─── */}
        <section style={{ padding: '2rem 0 3.5rem' }}>
          <div className="max-w-3xl mx-auto px-6 text-center">
            <p style={{ color: 'var(--kv-text-hi)', fontSize: '1.15rem', lineHeight: 1.9, fontWeight: 500 }}>{base.intro}</p>
          </div>
        </section>

        {/* ─── النقاط / المحتوى الغني ─── */}
        <section style={{ padding: '3.5rem 0', background: 'var(--kv-bg-alt)' }}>
          <div className="max-w-5xl mx-auto px-6">
            <div className="text-center mb-10">
              <div className="section-label" style={{ background: soft, color, borderColor: `${color}33` }}>{base.bulletsTitle}</div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {meta.bullets.map((b) => (
                <div key={b} className="service-card flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: soft }}>
                    {kind === 'status'
                      ? <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#16a34a', boxShadow: '0 0 0 4px #16a34a22' }} />
                      : <CheckCircle size={18} style={{ color }} />}
                  </div>
                  <span style={{ color: 'var(--kv-text-hi)', fontWeight: 600, fontSize: '0.95rem' }}>{b}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── بطاقات تواصل (لصفحة تواصل فقط) ─── */}
        {isContact && (
          <section style={{ padding: '4rem 0' }}>
            <div className="max-w-5xl mx-auto px-6 grid sm:grid-cols-3 gap-5">
              <a href={`mailto:${email}`} className="service-card text-center">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: soft }}><Mail size={22} style={{ color }} /></div>
                <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)' }}>البريد</h3>
                <p style={{ color: 'var(--kv-text-body)', fontSize: '0.85rem', direction: 'ltr' }}>{email}</p>
              </a>
              {phone && (
                <a href={`tel:${phone.replace(/[^\d]/g, '')}`} className="service-card text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: soft }}><Phone size={22} style={{ color }} /></div>
                  <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)' }}>الهاتف</h3>
                  <p style={{ color: 'var(--kv-text-body)', fontSize: '0.85rem', direction: 'ltr' }}>{phone}</p>
                </a>
              )}
              <div className="service-card text-center">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: soft }}><MapPin size={22} style={{ color }} /></div>
                <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)' }}>الموقع</h3>
                <p style={{ color: 'var(--kv-text-body)', fontSize: '0.85rem' }}>بغداد، العراق</p>
              </div>
            </div>
          </section>
        )}

        {/* ─── CTA ─── */}
        <section style={{ padding: '4.5rem 0', background: isContact ? 'var(--kv-bg-alt)' : 'var(--kv-bg-void)' }}>
          <div className="max-w-5xl mx-auto px-6">
            <div className="rounded-3xl p-10 md:p-14 text-center" style={{ background: 'var(--kv-accent-grad)' }}>
              <h2 className="font-black text-white" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
                {kind === 'careers' ? 'مهتم بالانضمام إلينا؟' : kind === 'contact' ? 'جاهز لبدء رحلتك؟' : 'ابدأ مع Kyvzon اليوم'}
              </h2>
              <p className="mt-3 mb-7" style={{ color: 'rgba(255,255,255,0.9)' }}>
                {kind === 'careers' ? 'أرسل سيرتك الذاتية ودعنا نتعرّف عليك.' : 'انضم لمؤسسات المنطقة التي تثق بـ Kyvzon لإدارة أعمالها.'}
              </p>
              <button onClick={() => navigate(custom?.ctaHref || '/signup?intent=general')} className="btn-primary" style={{ background: '#fff', color: 'var(--kv-accent-3)' }}>
                {custom?.ctaLabel || (kind === 'contact' || kind === 'careers' ? 'تواصل معنا' : 'أنشئ حساباً مجاناً')}
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ─── فوتر كامل ─── */}
      <Footer publicConfig={publicConfig || undefined} />
      <ContactFab publicConfig={publicConfig || undefined} />
    </div>
  );
}

export default function PublicInfoPage({ kind }: { kind: PageKind }) {
  return (
    <LangProvider>
      <InfoContent kind={kind} />
    </LangProvider>
  );
}
