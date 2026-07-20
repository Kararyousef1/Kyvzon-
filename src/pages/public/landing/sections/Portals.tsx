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
    <section id="portals" className="relative py-24 md:py-32 overflow-hidden" style={{ backgroundColor: 'var(--kv-bg-void)' }}>
      {/* توهج خلفي يتبع لون البوابة النشطة */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-[150px] pointer-events-none transition-all duration-1000"
        style={{ background: `${portal.color}14` }}
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-16">
          <div className="section-label"><Layers size={12} /> {t('portals_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('portals_title')}</h2>
          <p style={{ marginTop: '16px', color: 'var(--kv-text-body)', maxWidth: '36rem', margin: '16px auto 0' }}>{t('portals_sub')}</p>
        </Reveal>

        {/* Portal tabs — كبسولات متوهجة بلون كل بوابة */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {visiblePortals.map((p, i) => {
            const Icon = p.icon;
            const active = activePortal === i;
            return (
              <button
                key={p.id}
                onClick={() => setActivePortal(i)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: active ? `linear-gradient(135deg, ${p.color}2e, ${p.color}14)` : 'rgba(255,255,255,0.035)',
                  border: `1.5px solid ${active ? p.color + '88' : 'rgba(255,255,255,0.07)'}`,
                  color: active ? p.color : 'rgba(255,255,255,0.55)',
                  boxShadow: active ? `0 0 24px ${p.color}33, inset 0 1px 0 rgba(255,255,255,0.1)` : 'none',
                }}
                aria-pressed={active}
              >
                <Icon size={15} />
                {p.title[lang]}
              </button>
            );
          })}
        </div>

        {/* Active portal detail — بطاقة زجاجية بإطار ملوّن حيّ */}
        <div
          className="glass-dark rounded-[28px] p-8 md:p-12 transition-all duration-700"
          style={{ borderColor: `${portal.color}44`, boxShadow: `0 30px 90px -30px ${portal.color}55, inset 0 1px 0 rgba(255,255,255,0.06)` }}
        >
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="absolute -inset-1.5 rounded-2xl blur-lg opacity-60 transition-all duration-700" style={{ background: `${portal.color}55` }} aria-hidden="true" />
                  <div className="relative w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${portal.color}30, ${portal.color}10)`, border: `1.5px solid ${portal.color}55` }}>
                    <portal.icon size={26} style={{ color: portal.color }} />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white">{portal.title[lang]}</h3>
                  <div className="text-xs font-bold mt-1 tracking-wider uppercase" style={{ color: portal.color }}>KYVZON Portal</div>
                </div>
              </div>
              <p style={{ color: 'rgba(190,200,255,0.85)', lineHeight: '1.85', fontSize: '1.1rem' }}>{portal.desc[lang]}</p>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(160,175,255,0.7)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('portals_key_features')}
              </div>
              <ul className="space-y-2.5">
                {portal.features[lang].map((f, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-white/80 rounded-xl px-3.5 py-2.5 transition-all duration-300 hover:translate-x-1"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <CheckCircle size={16} style={{ flexShrink: 0, color: portal.color, filter: `drop-shadow(0 0 6px ${portal.color}66)` }} />
                    <span className="text-sm font-semibold">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate(`/portals/${portal.id}`)}
                className="mt-8 btn-primary"
                style={{ background: `linear-gradient(135deg, ${portal.color}, ${portal.color}bb)`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 30px ${portal.color}55` }}
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
                style={{ width: i === activePortal ? 28 : 6, background: i === activePortal ? `linear-gradient(90deg, ${portal.color}, ${portal.color}88)` : 'rgba(255,255,255,0.15)', boxShadow: i === activePortal ? `0 0 10px ${portal.color}66` : 'none' }}
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
                <div
                  onClick={() => setActivePortal(i)}
                  className={`portal-card text-center cursor-pointer ${activePortal === i ? 'active' : ''}`}
                  style={activePortal === i ? { boxShadow: `0 20px 50px -18px ${p.color}66` } : undefined}
                >
                  <div className="portal-icon-wrap w-11 h-11 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${p.color}28, ${p.color}0d)`, border: `1px solid ${p.color}33` }}>
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
