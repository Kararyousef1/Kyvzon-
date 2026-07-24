import React from 'react';
import { Layers, ArrowLeft, ArrowRight } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { PORTALS } from '../data';
import { useNavigate } from 'react-router-dom';
import type { PublicSiteConfig } from '../../../../services/sdk';

interface PortalsProps {
  onLoginClick: () => void;
  previewMode?: boolean;
  portalVisibility?: Record<string, boolean>;
  publicConfig?: PublicSiteConfig;
}

export function Portals({ portalVisibility, publicConfig }: PortalsProps) {
  const { lang, isRTL, t } = useLang();
  const navigate = useNavigate();

  const visiblePortals = (publicConfig?.portals?.length
    ? publicConfig.portals
        .filter((p) => p.enabled !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((p) => ({ ...p, icon: Layers, gradient: p.gradient || 'from-sky-500 to-blue-600' }))
    : PORTALS.filter((p) => (portalVisibility ? portalVisibility[p.id] !== false : true)));

  return (
    <section id="portals" className="relative overflow-hidden" style={{ backgroundColor: 'var(--kv-bg-void)', padding: 'var(--kv-section-y) 0' }}>
      <div className="relative max-w-7xl mx-auto px-6">
        {/* رأس القسم */}
        <Reveal className="text-center mb-14">
          <div className="mx-auto" style={{ maxWidth: '42rem' }}>
            <div className="section-label"><Layers size={12} /> {t('portals_label')}</div>
            <h2 className="section-title font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)', marginTop: '4px' }}>
              {t('portals_title')}
            </h2>
            <p style={{ marginTop: '14px', color: 'var(--kv-text-body)', fontSize: '1.05rem' }}>{t('portals_sub')}</p>
          </div>
        </Reveal>

        {/* شبكة كل البوابات — كل بطاقة قابلة للنقر → صفحة التفاصيل */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visiblePortals.map((p, i) => {
            const Icon = p.icon;
            const color = p.color || 'var(--kv-accent-1)';
            return (
              <Reveal key={p.id} delay={Math.min(i * 0.05, 0.4)}>
                <button
                  type="button"
                  onClick={() => navigate(`/portals/${p.id}`)}
                  className="portal-card text-start w-full h-full flex flex-col group"
                  aria-label={p.title[lang]}
                >
                  {/* أيقونة بلون البوابة */}
                  <div
                    className="portal-icon-wrap w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                    style={{ background: `${color}14`, border: `1px solid ${color}26` }}
                  >
                    <Icon size={26} style={{ color }} />
                  </div>

                  <h3 className="font-black mb-2" style={{ color: 'var(--kv-text-hi)', fontSize: '1.15rem' }}>
                    {p.title[lang]}
                  </h3>
                  <p className="flex-1" style={{ color: 'var(--kv-text-body)', fontSize: '0.9rem', lineHeight: 1.75 }}>
                    {p.desc[lang]}
                  </p>

                  {/* أبرز وحدتين + رابط */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.features[lang].slice(0, 2).map((f) => (
                      <span
                        key={f}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: `${color}12`, color }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>

                  <div
                    className="mt-5 pt-4 flex items-center gap-1.5 text-sm font-bold transition-transform group-hover:gap-2.5"
                    style={{ borderTop: '1px solid var(--kv-border)', color }}
                  >
                    {t('portals_explore')}
                    {isRTL ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
