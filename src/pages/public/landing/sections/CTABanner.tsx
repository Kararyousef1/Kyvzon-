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
            className="rounded-3xl p-12 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(139,92,246,0.15) 100%)', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            <div className="absolute inset-0 hero-grid opacity-30" aria-hidden="true" />
            <div className="relative z-10">
              <div className="text-5xl mb-4">🚀</div>
              <h2 className="text-3xl md:text-4xl font-black text-white mb-4">{t('cta_title')}</h2>
              <p style={{ color: 'rgba(180,195,255,0.78)', marginBottom: '28px', maxWidth: '32rem', margin: '0 auto 28px' }}>{t('cta_sub')}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={() => navigate(publicConfig?.primaryCtaHref || '/signup?intent=demo')} className="btn-primary">
                  <Rocket size={15} />
                  {publicConfig?.primaryCtaLabel || t('cta_start_now')}
                </button>
                <button onClick={() => navigate('/signup?intent=demo&label=Talk%20to%20expert')} className="btn-outline">
                  {t('cta_talk_expert')}
                </button>
              </div>
              <p style={{ marginTop: 20, fontSize: '0.75rem', color: 'rgba(180,195,255,0.45)' }}>{t('cta_trust_row')}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
