import React from 'react';
import { Rocket } from 'lucide-react';
import { useLang } from '../LangContext';
import { useNavigate } from 'react-router-dom';
import type { PublicSiteConfig } from '../../../../services/sdk';
import { Reveal } from '../ui/Reveal';

export function CTABanner({ onLoginClick, publicConfig }: { onLoginClick: () => void; publicConfig?: PublicSiteConfig }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section className="py-20" style={{ backgroundColor: 'var(--kv-bg-void)' }}>
      <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
        <Reveal>
          <div
            className="rounded-[32px] p-12 md:p-16 relative overflow-hidden"
            style={{
              background: 'linear-gradient(rgba(10,12,32,0.92), rgba(10,12,32,0.92)) padding-box, var(--kv-accent-grad-full) border-box',
              border: '1px solid transparent',
              boxShadow: '0 40px 120px -40px rgba(99,102,241,0.6)',
            }}
          >
            {/* أورورا داخلية متحركة */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="anim-aurora absolute -top-24 -left-24 w-[350px] h-[350px] rounded-full bg-indigo-500/20 blur-[90px]" />
              <div className="anim-aurora absolute -bottom-24 -right-24 w-[350px] h-[350px] rounded-full bg-cyan-400/12 blur-[90px]" style={{ animationDelay: '-6s' }} />
              <div className="absolute inset-0 hero-grid opacity-20" />
            </div>

            <div className="relative z-10">
              <div className="text-5xl mb-5 anim-float inline-block">🚀</div>
              <h2 className="text-3xl md:text-5xl font-black mb-5 leading-tight">
                <span className="kv-gradient-text" style={{ filter: 'drop-shadow(0 0 26px rgba(139,92,246,0.4))' }}>{t('cta_title')}</span>
              </h2>
              <p style={{ color: 'rgba(190,200,255,0.8)', marginBottom: '32px', maxWidth: '32rem', margin: '0 auto 32px', fontSize: '1.05rem', lineHeight: 1.8 }}>{t('cta_sub')}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => navigate(publicConfig?.primaryCtaHref || '/signup?intent=demo')} className="btn-primary text-base px-8 py-3.5">
                  <Rocket size={16} />
                  {publicConfig?.primaryCtaLabel || t('cta_start_now')}
                </button>
                <button onClick={() => navigate('/signup?intent=demo&label=Talk%20to%20expert')} className="btn-outline text-base px-8 py-3.5">
                  {t('cta_talk_expert')}
                </button>
              </div>
              <p style={{ marginTop: 24, fontSize: '0.78rem', color: 'rgba(180,195,255,0.5)', fontWeight: 600 }}>{t('cta_trust_row')}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
