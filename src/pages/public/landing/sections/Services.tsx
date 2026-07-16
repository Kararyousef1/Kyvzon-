import React from 'react';
import { Settings } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { EXTRA_SERVICES } from '../data';
import { useNavigate } from 'react-router-dom';
import type { PublicSiteConfig } from '../../../../services/sdk';

export function Services({ publicConfig }: { publicConfig?: PublicSiteConfig }) {
  const { lang, t } = useLang();
  const navigate = useNavigate();
  const displayServices = (publicConfig?.services?.filter(s => s.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(s => ({ ...s, icon: Settings })) || EXTRA_SERVICES);

  return (
    <section id="services" className="py-24 md:py-32" style={{ backgroundColor: 'var(--kv-bg-void)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-16">
          <div className="section-label"><Settings size={12} /> {t('services_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('services_title')}</h2>
          <p style={{ marginTop: '16px', color: 'rgba(180,190,255,0.75)', maxWidth: '34rem', margin: '16px auto 0' }}>{t('services_sub')}</p>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {displayServices.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={i} delay={i * 0.08}>
                <div className="service-card h-full flex flex-col">
                  <div
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold mb-4 self-start"
                    style={{ background: `${s.color}18`, color: s.color, border: `1px solid ${s.color}33` }}
                  >
                    {s.badge[lang]}
                  </div>
                  <div className="w-12 h-12 rounded-xl mb-4 flex items-center justify-center" style={{ background: `${s.color}18` }}>
                    <Icon size={22} style={{ color: s.color }} />
                  </div>
                  <h3 className="font-black text-white text-base mb-2">{s.title[lang]}</h3>
                  <p style={{ color: 'rgba(180,195,255,0.75)', fontSize: '0.875rem', lineHeight: '1.7', flex: 1 }}>{s.desc[lang]}</p>
                  <div className="mt-4 pt-4 text-xs font-semibold" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: s.color }}>
                    {s.promo[lang]}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/signup?intent=service&service=${encodeURIComponent(s.title.en || s.title[lang])}&label=${encodeURIComponent(s.title[lang])}`)}
                    className="btn-outline w-full justify-center mt-4 py-2 text-xs"
                  >
                    {lang === 'en' ? 'Request service' : lang === 'ku' ? 'داوای خزمەتگوزاری بکە' : 'اطلب الخدمة'}
                  </button>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
