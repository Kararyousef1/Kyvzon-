import React from 'react';
import { Layers, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { useAutoRotate } from '../hooks';
import { PORTALS } from '../data';
import { useNavigate } from 'react-router-dom';
import type { PublicSiteConfig } from '../../../../services/sdk';

interface PortalsProps {
  onLoginClick: () => void;
  previewMode?: boolean;
  portalVisibility?: Record<string, boolean>;
  publicConfig?: PublicSiteConfig;
}

export function Portals({ onLoginClick, previewMode, portalVisibility, publicConfig }: PortalsProps) {
  const { lang, isRTL, t } = useLang();
  const navigate = useNavigate();
  const visiblePortals = (publicConfig?.portals?.length ? publicConfig.portals.filter(p => p.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(p => ({ ...p, icon: Layers, gradient: p.gradient || 'from-indigo-500 to-violet-600' })) : PORTALS.filter(p => portalVisibility ? portalVisibility[p.id] !== false : true));
  const [activePortal, setActivePortal] = useAutoRotate(visiblePortals.length || 1, 5000, !previewMode);
  const portal = visiblePortals[activePortal] || visiblePortals[0] || PORTALS[0];

  return (
    <section id="portals" className="py-24 md:py-32" style={{ backgroundColor: 'var(--kv-bg-void)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-16">
          <div className="section-label"><Layers size={12} /> {t('portals_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('portals_title')}</h2>
          <p style={{ marginTop: '16px', color: 'rgba(180,190,255,0.75)', maxWidth: '36rem', margin: '16px auto 0' }}>{t('portals_sub')}</p>
        </Reveal>

        {/* Portal tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {visiblePortals.map((p, i) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => setActivePortal(i)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300"
                style={{
                  background: activePortal === i ? `${p.color}22` : 'rgba(255,255,255,0.04)',
                  border: `1.5px solid ${activePortal === i ? p.color + '66' : 'rgba(255,255,255,0.07)'}`,
                  color: activePortal === i ? p.color : 'rgba(255,255,255,0.55)',
                }}
                aria-pressed={activePortal === i}
              >
                <Icon size={15} />
                {p.title[lang]}
              </button>
            );
          })}
        </div>

        {/* Active portal detail */}
        <div className="glass-dark rounded-3xl p-8 md:p-12 transition-all duration-500">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: `${portal.color}22`, border: `1.5px solid ${portal.color}44` }}>
                  <portal.icon size={26} style={{ color: portal.color }} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white">{portal.title[lang]}</h3>
                  <div className="text-xs font-semibold mt-1" style={{ color: portal.color }}>KYVZON Portal</div>
                </div>
              </div>
              <p style={{ color: 'rgba(190,200,255,0.85)', lineHeight: '1.8', fontSize: '1.1rem' }}>{portal.desc[lang]}</p>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(160,175,255,0.7)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('portals_key_features')}
              </div>
              <ul className="space-y-3">
                {portal.features[lang].map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-white/75">
                    <CheckCircle size={16} style={{ flexShrink: 0, color: portal.color }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate(`/portals/${portal.id}`)}
                className="mt-8 btn-primary"
                style={{ background: `linear-gradient(135deg, ${portal.color}, ${portal.color}bb)`, boxShadow: `0 4px 20px ${portal.color}44` }}
              >
                {t('portals_explore')}
                {isRTL ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
              </button>
            </div>
          </div>
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mt-8">
            {visiblePortals.map((_, i) => (
              <button
                key={i}
                onClick={() => setActivePortal(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === activePortal ? 24 : 6, background: i === activePortal ? portal.color : 'rgba(255,255,255,0.15)' }}
                aria-label={`${portal.title[lang]} ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Portal grid mini cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-8">
          {visiblePortals.map((p, i) => {
            const Icon = p.icon;
            return (
              <Reveal key={p.id} delay={i * 0.07}>
                <div onClick={() => setActivePortal(i)} className={`portal-card text-center cursor-pointer ${activePortal === i ? 'active' : ''}`}>
                  <div className="portal-icon-wrap w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: `${p.color}18` }}>
                    <Icon size={18} style={{ color: p.color }} />
                  </div>
                  <div className="text-xs font-bold text-white leading-tight">{p.title[lang]}</div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
