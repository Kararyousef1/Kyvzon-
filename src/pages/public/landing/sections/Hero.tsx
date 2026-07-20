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
      {/* خلفية أورورا متحركة ثلاثية الطبقات */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="anim-aurora absolute -top-40 -right-40 w-[650px] h-[650px] rounded-full bg-indigo-600/15 blur-[130px]" />
        <div className="anim-aurora absolute -bottom-40 -left-20 w-[550px] h-[550px] rounded-full bg-violet-700/12 blur-[110px]" style={{ animationDelay: '-5s' }} />
        <div className="anim-aurora absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-cyan-500/08 blur-[120px]" style={{ animationDelay: '-9s' }} />
        {/* شعاع ضوئي علوي */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(165,180,252,0.7), transparent)' }} />
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

            <h1 className="hero-h1 anim-fade-up-1 mt-7 font-black leading-[1.12] tracking-tight" style={{ fontSize: 'clamp(2.7rem, 4.6vw, 4rem)' }}>
              {landingConfig?.heroTitleAr || landingConfig?.heroTitleEn
                ? (lang === 'en' ? landingConfig?.heroTitleEn : landingConfig?.heroTitleAr)
                : (
                  <>
                    <span className="text-white">{t('hero_h1_1')}</span>
                    <br />
                    <span className="kv-gradient-text" style={{ filter: 'drop-shadow(0 0 30px rgba(139,92,246,0.35))' }}>
                      {t('hero_h1_2')}
                    </span>
                  </>
                )}
            </h1>

            <p className="anim-fade-up-2" style={{ marginTop: '26px', fontSize: '1.12rem', color: 'var(--kv-text-body)', lineHeight: '1.85', maxWidth: '38rem' }}>
              {(lang === 'en' ? landingConfig?.heroDescEn : landingConfig?.heroDescAr) || t('hero_desc')}
            </p>

            <div className="anim-fade-up-3 mt-9 flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => navigate(publicConfig?.primaryCtaHref || '/signup?intent=demo')}>
                <Rocket size={16} />
                {publicConfig?.primaryCtaLabel || t('hero_cta1')}
              </button>
              <button className="btn-outline" onClick={() => scrollTo('screenshots')}>
                <Play size={14} />
                {t('hero_cta2')}
              </button>
            </div>

            {/* إحصائيات سريعة — بطاقات زجاجية مصغرة بدل صف مسطح */}
            <div className="anim-fade-up-4 mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {QUICK_STATS.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm transition-all duration-300 hover:border-indigo-400/40 hover:bg-indigo-500/[0.07] hover:-translate-y-0.5"
                >
                  <div className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(34,211,238,0.12))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                    <s.icon size={15} style={{ color: '#a5b4fc' }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white leading-tight">{s.v}</div>
                    <div className="text-[11px] text-white/45 leading-tight truncate">{s.l[lang]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Mockup column — إطار متوهج عائم ── */}
          <div className="hidden lg:block anim-fade-up-2">
            <div className="relative anim-float">
              <div
                className="absolute -inset-4 rounded-[36px] opacity-40 blur-2xl pointer-events-none"
                style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.3), rgba(34,211,238,0.35))' }}
                aria-hidden="true"
              />
              <div className="relative">
                <HeroMockup />
              </div>
            </div>
          </div>
        </div>

        {/* Mockup on mobile */}
        <div className="lg:hidden mt-14 anim-fade-up-3">
          <HeroMockup />
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/30 text-xs anim-bounce" aria-hidden="true">
        <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-1.5">
          <div className="w-1 h-2 rounded-full bg-indigo-400/80" />
        </div>
        <ChevronDown size={16} />
      </div>
    </section>
  );
}
