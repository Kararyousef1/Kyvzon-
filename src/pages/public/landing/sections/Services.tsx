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
    <section id="services" className="relative overflow-hidden" style={{ backgroundColor: 'var(--kv-bg-void)', paddingBlock: 'var(--kv-section-y)' }}>
      <div className="absolute top-1/4 -left-32 w-[400px] h-[400px] rounded-full bg-sky-400/[0.06] blur-[120px] pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-16">
          <div className="section-label"><Settings size={12} /> {t('services_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('services_title')}</h2>
          <p style={{ marginTop: '16px', color: 'var(--kv-text-body)', maxWidth: '34rem', margin: '16px auto 0' }}>{t('services_sub')}</p>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {displayServices.map((s, i) => {
            const Icon = s.icon;
            return (
              <Reveal key={i} delay={i * 0.08}>
                <div className="service-card h-full flex flex-col group">
                  <div
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold mb-5 self-start"
                    style={{ background: `${s.color}1a`, color: s.color, border: `1px solid ${s.color}40`, boxShadow: `0 0 14px ${s.color}22` }}
                  >
                    {s.badge[lang]}
                  </div>

                  {/* أيقونة بهالة توهج تتفاعل مع المرور */}
                  <div className="relative mb-5 self-start">
                    <div
                      className="absolute -inset-1.5 rounded-2xl blur-lg opacity-40 transition-opacity duration-300 group-hover:opacity-80"
                      style={{ background: `${s.color}55` }}
                      aria-hidden="true"
                    />
                    <div
                      className="relative w-13 h-13 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
                      style={{ width: 52, height: 52, background: `linear-gradient(135deg, ${s.color}2e, ${s.color}0d)`, border: `1px solid ${s.color}44` }}
                    >
                      <Icon size={22} style={{ color: s.color }} />
                    </div>
                  </div>

                  <h3 className="font-black text-white text-base mb-2">{s.title[lang]}</h3>
                  <p style={{ color: 'var(--kv-text-body)', fontSize: '0.875rem', lineHeight: '1.75', flex: 1 }}>{s.desc[lang]}</p>
                  <div className="mt-4 pt-4 text-xs font-bold" style={{ borderTop: '1px solid var(--kv-border)', color: s.color }}>
                    {s.promo[lang]}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const sid = (s as { id?: string }).id;
                      if (sid) navigate(`/services/${sid}`);
                      else navigate(`/signup?intent=service&service=${encodeURIComponent(s.title.en || s.title[lang])}&label=${encodeURIComponent(s.title[lang])}`);
                    }}
                    className="btn-outline w-full justify-center mt-4 py-2 text-xs"
                  >
                    {lang === 'en' ? 'Learn more' : lang === 'ku' ? 'زیاتر بزانە' : 'اعرف المزيد'}
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
