import React from 'react';
import { Award } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { StatCounter } from '../ui/StatCounter';
import { WHY_REASONS, STATS } from '../data';

export function WhyKyvzon() {
  const { lang, t } = useLang();

  return (
    <section className="relative py-20 md:py-28 overflow-hidden" style={{ backgroundColor: 'var(--kv-bg-alt)' }}>
      {/* توهجات زاوية */}
      <div className="absolute -top-32 -left-32 w-[450px] h-[450px] rounded-full bg-indigo-600/10 blur-[130px] pointer-events-none" aria-hidden="true" />
      <div className="absolute -bottom-32 -right-32 w-[450px] h-[450px] rounded-full bg-cyan-500/07 blur-[130px] pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        <div className="glass-dark rounded-[32px] p-8 md:p-14">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <div className="section-label"><Award size={12} /> {t('why_label')}</div>
              <h2 className="text-3xl md:text-4xl font-black text-white mt-3 mb-6 leading-snug">{t('why_title')}</h2>
              <p style={{ color: 'var(--kv-text-body)', lineHeight: '1.85', marginBottom: '32px' }}>{t('why_desc')}</p>

              {/* أسباب — بطاقات زجاجية مصغرة تفاعلية */}
              <div className="grid grid-cols-2 gap-3">
                {WHY_REASONS.map((it, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-2xl p-3.5 transition-all duration-300 hover:-translate-y-0.5"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(148,163,255,0.09)' }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(34,211,238,0.1))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                      <it.icon size={15} style={{ color: '#a5b4fc' }} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white leading-tight">{it.title[lang]}</div>
                      <div style={{ fontSize: '0.72rem', color: 'rgba(180,195,255,0.5)', marginTop: 3, lineHeight: 1.5 }}>{it.desc[lang]}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="relative">
                {/* هالة توهج خلف بطاقة العراق */}
                <div
                  className="absolute -inset-3 rounded-[28px] blur-2xl opacity-50 pointer-events-none"
                  style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.2), rgba(34,211,238,0.3))' }}
                  aria-hidden="true"
                />
                <div
                  className="relative rounded-[24px] overflow-hidden"
                  style={{
                    background: 'linear-gradient(rgba(15,18,42,0.92), rgba(15,18,42,0.92)) padding-box, linear-gradient(150deg, rgba(129,140,248,0.6), rgba(139,92,246,0.15) 45%, rgba(34,211,238,0.4)) border-box',
                    border: '1px solid transparent',
                    padding: '36px',
                  }}
                >
                  <div className="text-center mb-7">
                    <div className="text-6xl mb-3 anim-float inline-block">🇮🇶</div>
                    <div className="text-2xl font-black text-white">العراق — Iraq</div>
                    <div style={{ color: 'rgba(180,195,255,0.7)', fontSize: '0.875rem', marginTop: '4px' }}>بغداد · Baghdad</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { v: '٦', l: { ar: 'بوابات', en: 'Portals', ku: 'دەروازەکان' } },
                      { v: '∞', l: { ar: 'موظفون', en: 'Employees', ku: 'کارمەند' } },
                      { v: '٣', l: { ar: 'لغات', en: 'Languages', ku: 'زمان' } },
                      { v: '٢٤/٧', l: { ar: 'دعم', en: 'Support', ku: 'پشتگیری' } },
                    ].map((s, i) => (
                      <div
                        key={i}
                        className="rounded-2xl p-4 text-center transition-all duration-300 hover:-translate-y-0.5"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,255,0.08)' }}
                      >
                        <div className="text-2xl font-black kv-gradient-text">{s.v}</div>
                        <div className="text-xs text-white/45 mt-1">{s.l[lang]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* KPI row */}
          <Reveal delay={0.1}>
            <div className="mt-10 pt-10 grid grid-cols-2 md:grid-cols-4 gap-4" style={{ borderTop: '1px solid rgba(148,163,255,0.09)' }}>
              <div className="col-span-2 md:col-span-4 mb-1 text-center" style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(160,175,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('why_kpi_label')}
              </div>
              {STATS.map((s, i) => (
                <div key={i} className="text-center">
                  <StatCounter value={s.value} suffix={s.suffix} className="text-2xl md:text-3xl font-black text-white" />
                  <div style={{ color: 'rgba(180,195,255,0.5)', fontSize: '0.72rem', marginTop: 4 }}>{s.label[lang]}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
