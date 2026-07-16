import React from 'react';
import { Shield, Zap, Clock, Globe, Rocket, Play, ChevronDown } from 'lucide-react';
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

export function Hero({ onLoginClick, landingConfig, publicConfig }: HeroProps) {
  const { lang, t } = useLang();
  const navigate = useNavigate();

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section id="home" className="relative min-h-screen flex items-center overflow-hidden hero-grid">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute -bottom-40 -left-20 w-[500px] h-[500px] rounded-full bg-violet-700/08 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-indigo-500/04 blur-[140px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pt-28 pb-20 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* ── Copy column ── */}
          <div className="max-w-2xl">
            <div className="anim-fade-up">
              <span className="badge">
                <span className="glow-dot" />
                {t('hero_badge')}
              </span>
            </div>

            <h1 className="hero-h1 anim-fade-up-1 mt-6 font-black leading-tight tracking-tight" style={{ fontSize: 'clamp(2.6rem, 4.4vw, 3.75rem)' }}>
              {landingConfig?.heroTitleAr || landingConfig?.heroTitleEn ? (lang === 'en' ? landingConfig?.heroTitleEn : landingConfig?.heroTitleAr) : (<><span className="text-white">{t('hero_h1_1')}</span><br /><span style={{ background: 'linear-gradient(135deg, #818cf8, #c4b5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{t('hero_h1_2')}</span></>)}
            </h1>

            <p className="anim-fade-up-2" style={{ marginTop: '24px', fontSize: '1.1rem', color: 'rgba(180,195,255,0.8)', lineHeight: '1.8', maxWidth: '38rem' }}>
              {(lang === 'en' ? landingConfig?.heroDescEn : landingConfig?.heroDescAr) || t('hero_desc')}
            </p>

            <div className="anim-fade-up-3 mt-8 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => navigate(publicConfig?.primaryCtaHref || '/signup?intent=demo')}>
                <Rocket size={16} />
                {publicConfig?.primaryCtaLabel || t('hero_cta1')}
              </button>
              <button className="btn-outline" onClick={() => scrollTo('screenshots')}>
                <Play size={14} />
                {t('hero_cta2')}
              </button>
            </div>

            <div className="anim-fade-up-4 mt-12 flex flex-wrap gap-6">
              {QUICK_STATS.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                    <s.icon size={14} style={{ color: '#818cf8' }} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{s.v}</div>
                    <div className="text-xs text-white/45">{s.l[lang]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Mockup column ── */}
          <div className="hidden lg:block anim-fade-up-2">
            <HeroMockup />
          </div>
        </div>

        {/* Mockup on mobile — below the fold copy, still visible but simplified via CSS scaling */}
        <div className="lg:hidden mt-14 anim-fade-up-3">
          <HeroMockup />
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30 text-xs anim-bounce">
        <ChevronDown size={20} />
      </div>
    </section>
  );
}
