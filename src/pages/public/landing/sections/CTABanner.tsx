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
    <section className="kv-section" style={{ backgroundColor: 'var(--kv-bg-void)' }}>
      <div className="kv-container">
        <Reveal>
          <div
            className="relative overflow-hidden text-center"
            style={{
              background: 'var(--kv-accent-grad)',
              borderRadius: 'var(--kv-r-2xl)',
              padding: 'clamp(2.5rem, 6vw, 4.5rem)',
              boxShadow: '0 40px 90px -35px rgba(20,102,216,0.45)',
            }}
          >
            {/* عناصر تجريدية خفيفة */}
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div className="kv-glow-orb" style={{ inset: '-30% -10% auto auto', width: 420, height: 420, background: 'rgba(255,255,255,0.14)' }} />
              <div className="kv-glow-orb" style={{ inset: 'auto auto -40% -10%', width: 380, height: 380, background: 'rgba(56,166,240,0.28)' }} />
            </div>

            <div className="relative z-10">
              <div className="text-5xl mb-5 anim-float inline-block">🚀</div>
              <h2 className="font-black mb-4 leading-tight" style={{ fontSize: 'var(--kv-fs-h2)', color: '#fff' }}>{t('cta_title')}</h2>
              <p style={{ color: 'rgba(255,255,255,0.9)', maxWidth: '34rem', margin: '0 auto 2rem', fontSize: 'var(--kv-fs-lead)', lineHeight: 1.75 }}>{t('cta_sub')}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => navigate(publicConfig?.primaryCtaHref || '/signup?intent=demo')} className="btn-primary" style={{ background: '#fff', color: 'var(--kv-accent-2)' }}>
                  <Rocket size={16} />
                  {publicConfig?.primaryCtaLabel || t('cta_start_now')}
                </button>
                <button onClick={() => navigate('/signup?intent=demo&label=Talk%20to%20expert')} className="btn-outline" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}>
                  {t('cta_talk_expert')}
                </button>
              </div>
              <p style={{ marginTop: '1.5rem', fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{t('cta_trust_row')}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
