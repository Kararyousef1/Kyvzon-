import React from 'react';
import { Shield, Zap, Clock, Globe, Rocket, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { LandingConfig } from '../../../../shared/types/landing';
import type { PublicSiteConfig } from '../../../../services/sdk';
import { useLang } from '../LangContext';
import { HeroMockup } from './HeroMockup';

interface HeroProps {
  onLoginClick: () => void;
  landingConfig?: Partial<LandingConfig> | null;
  publicConfig?: PublicSiteConfig;
}

const QUICK_STATS = [
  { icon: Shield, v: '100%', l: { ar: 'أمان وخصوصية', en: 'Security', ku: 'ئەمنییەت' } },
  { icon: Zap, v: '8+', l: { ar: 'بوابات متكاملة', en: 'Portals', ku: 'دەروازەکان' } },
  { icon: Clock, v: '24/7', l: { ar: 'دعم فني', en: 'Support', ku: 'پشتگیری' } },
  { icon: Globe, v: '🇮🇶', l: { ar: 'صُنع في العراق', en: 'Made in Iraq', ku: 'لە عێراق' } },
];

export function Hero({ landingConfig, publicConfig }: HeroProps) {
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // نصوص الهيرو: تُفضّل من لوحة التحكم (content) إن وُجدت
  const c = publicConfig?.content;
  const media = publicConfig?.media;
  const pick = (v?: { ar: string; en: string; ku: string }) => (v && v[lang]?.trim() ? v[lang] : undefined);

  return (
    <section id="home" className="relative overflow-hidden hero-grid">
      {/* خلفية تجريدية خفيفة جداً */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="kv-glow-orb" style={{ inset: '-10% -10% auto auto', width: 640, height: 640, background: 'rgba(56,166,240,0.16)' }} />
        <div className="kv-glow-orb" style={{ inset: 'auto auto -20% -10%', width: 520, height: 520, background: 'rgba(20,102,216,0.10)' }} />
      </div>

      <div className="kv-container relative z-10" style={{ paddingBlock: 'clamp(6rem, 12vw, 9rem) var(--kv-section-y)' }}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* عمود النص */}
          <div className="max-w-2xl">
            <div className="anim-fade-up">
              <span className="kv-eyebrow"><span className="glow-dot" /> {pick(c?.heroBadge) || t('hero_badge')}</span>
            </div>

            <h1
              className="hero-h1 anim-fade-up-1 font-black"
              style={{ fontSize: 'var(--kv-fs-display)', lineHeight: 'var(--kv-lh-tight)', letterSpacing: '-0.03em', marginTop: 'var(--kv-space-5)', color: 'var(--kv-text-hi)' }}
            >
              {pick(c?.heroTitle1) || pick(c?.heroTitle2)
                ? (<>
                    <span>{pick(c?.heroTitle1) || t('hero_h1_1')}</span>
                    <br />
                    <span className="kv-gradient-text">{pick(c?.heroTitle2) || t('hero_h1_2')}</span>
                  </>)
                : landingConfig?.heroTitleAr || landingConfig?.heroTitleEn
                ? (lang === 'en' ? landingConfig?.heroTitleEn : landingConfig?.heroTitleAr)
                : (
                  <>
                    <span>{t('hero_h1_1')}</span>
                    <br />
                    <span className="kv-gradient-text">{t('hero_h1_2')}</span>
                  </>
                )}
            </h1>

            <p className="anim-fade-up-2" style={{ marginTop: 'var(--kv-space-5)', fontSize: 'var(--kv-fs-lead)', color: 'var(--kv-text-body)', lineHeight: 'var(--kv-lh-normal)', maxWidth: '38rem' }}>
              {pick(c?.heroDesc) || (lang === 'en' ? landingConfig?.heroDescEn : landingConfig?.heroDescAr) || t('hero_desc')}
            </p>

            <div className="anim-fade-up-3 flex flex-wrap gap-3" style={{ marginTop: 'var(--kv-space-7)' }}>
              <button className="btn-primary" onClick={() => navigate(publicConfig?.primaryCtaHref || '/signup?intent=demo')}>
                <Rocket size={16} />
                {publicConfig?.primaryCtaLabel || t('hero_cta1')}
              </button>
              <button className="btn-outline" onClick={() => scrollTo('screenshots')}>
                <Play size={14} />
                {t('hero_cta2')}
              </button>
            </div>

            {/* إزالة الحواجز */}
            <div className="anim-fade-up-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ marginTop: 'var(--kv-space-4)', color: 'var(--kv-text-muted)' }}>
              <span className="inline-flex items-center gap-1.5">✓ {lang === 'en' ? 'Free trial' : lang === 'ku' ? 'تاقیکردنەوەی خۆڕایی' : 'مجاني للتجربة'}</span>
              <span className="inline-flex items-center gap-1.5">✓ {lang === 'en' ? 'No credit card' : lang === 'ku' ? 'بەبێ کارتی بانکی' : 'بلا بطاقة ائتمان'}</span>
              <span className="inline-flex items-center gap-1.5">✓ {lang === 'en' ? 'Arabic support' : lang === 'ku' ? 'پشتگیری عەرەبی' : 'دعم عربي كامل'}</span>
            </div>

            {/* إحصائيات سريعة */}
            <div className="anim-fade-up-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginTop: 'var(--kv-space-8)' }}>
              {QUICK_STATS.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-2xl p-3" style={{ background: '#fff', border: '1px solid var(--kv-border)', boxShadow: 'var(--kv-shadow-xs)' }}>
                  <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'var(--kv-accent-soft)' }}>
                    <s.icon size={15} style={{ color: 'var(--kv-accent-1)' }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-black leading-tight" style={{ color: 'var(--kv-text-hi)' }}>{s.v}</div>
                    <div className="text-[11px] leading-tight truncate" style={{ color: 'var(--kv-text-muted)' }}>{s.l[lang]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* عمود الموك-أب / الوسائط */}
          <div className="hidden lg:block anim-fade-up-2">
            <HeroVisual media={media} />
          </div>
        </div>

        {/* على الجوال */}
        <div className="lg:hidden anim-fade-up-3" style={{ marginTop: 'var(--kv-space-10)' }}>
          <HeroVisual media={media} />
        </div>
      </div>
    </section>
  );
}

/** يحوّل رابط يوتيوب لصيغة embed */
function toEmbed(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

/** يعرض فيديو الهيرو أو صورته أو الموك-أب الافتراضي حسب إعدادات لوحة التحكم */
function HeroVisual({ media }: { media?: { heroVideoUrl?: string; heroImageUrl?: string } }) {
  const video = media?.heroVideoUrl?.trim();
  const image = media?.heroImageUrl?.trim();

  if (video) {
    const embed = toEmbed(video);
    return (
      <div className="kv-device relative anim-float" style={{ maxWidth: 560, marginInline: 'auto' }}>
        <div style={{ position: 'relative', paddingBottom: '62%', height: 0, background: '#000' }}>
          {embed ? (
            <iframe
              src={embed} title="hero video" loading="lazy" allowFullScreen
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            />
          ) : (
            <video src={video} controls playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
      </div>
    );
  }

  if (image) {
    return (
      <div className="kv-device relative anim-float" style={{ maxWidth: 560, marginInline: 'auto' }}>
        <img src={image} alt="KYVZON" loading="lazy" style={{ display: 'block', width: '100%', height: 'auto' }} />
      </div>
    );
  }

  return <HeroMockup />;
}
