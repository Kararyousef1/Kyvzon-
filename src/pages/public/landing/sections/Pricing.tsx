import React, { useState } from 'react';
import { Star, Users, Check, X, ChevronDown, ShieldCheck, RefreshCw, LifeBuoy, Download } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { PLANS, PLAN_COMPARISON } from '../data';
import type { CompareValue } from '../data';
import { useNavigate } from 'react-router-dom';
import type { PublicSiteConfig } from '../../../../services/sdk';

function CompareCell({ value, lang, highlight }: { value: CompareValue; lang: 'ar' | 'en' | 'ku'; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return value
      ? <Check size={16} style={{ color: highlight ? '#a5b4fc' : '#6366f1', margin: '0 auto' }} />
      : <X size={14} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />;
  }
  const text = typeof value === 'string' ? value : value[lang];
  return <span style={{ color: highlight ? '#c4b5fd' : 'rgba(200,210,255,0.75)', fontWeight: 600 }}>{text}</span>;
}

const GUARANTEES = [
  { icon: RefreshCw, key: 'pricing_guarantee_1' },
  { icon: ShieldCheck, key: 'pricing_guarantee_2' },
  { icon: LifeBuoy, key: 'pricing_guarantee_3' },
  { icon: Download, key: 'pricing_guarantee_4' },
] as const;

export function Pricing({ onLoginClick, publicConfig }: { onLoginClick: () => void; publicConfig?: PublicSiteConfig }) {
  const { lang, t } = useLang();
  const [compareOpen, setCompareOpen] = useState(false);
  const navigate = useNavigate();
  const displayPlans = (publicConfig?.plans?.filter(p => p.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) || PLANS);

  return (
    <section id="pricing" className="py-24 md:py-32 relative" style={{ backgroundColor: 'var(--kv-bg-alt)' }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/06 blur-[100px]" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-16">
          <div className="section-label"><Star size={12} /> {t('pricing_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('pricing_title')}</h2>
          <p style={{ marginTop: '16px', color: 'rgba(180,190,255,0.75)', maxWidth: '36rem', margin: '16px auto 0' }}>{t('pricing_sub')}</p>
        </Reveal>

        {/* Guarantees row */}
        <Reveal delay={0.05}>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 mb-12">
            {GUARANTEES.map(({ icon: Icon, key }) => (
              <div key={key} className="flex items-center gap-2">
                <Icon size={14} style={{ color: '#818cf8' }} />
                <span style={{ fontSize: '0.8rem', color: 'rgba(200,210,255,0.65)', fontWeight: 600 }}>{t(key)}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {displayPlans.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 0.1}>
              <div className={`price-card h-full flex flex-col ${plan.highlight ? 'highlight' : ''}`}>
                {plan.badge && (
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4 self-start"
                    style={{ background: plan.highlight ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)', color: plan.highlight ? '#a5b4fc' : 'rgba(255,255,255,0.7)' }}
                  >
                    {plan.highlight && <Star size={11} fill="#a5b4fc" />}
                    {plan.badge[lang]}
                  </div>
                )}
                <div className="text-xl font-black tracking-wide text-white mb-1">{plan.name[lang]}</div>
                <div style={{ color: 'rgba(180,195,255,0.75)', fontSize: '0.875rem', marginBottom: '24px' }}>{plan.desc[lang]}</div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Users size={16} style={{ color: plan.highlight ? '#818cf8' : '#6366f1', flexShrink: 0 }} />
                  <span className="text-xl font-black text-white">{plan.range[lang]}</span>
                </div>
                <div style={{ color: 'rgba(160,175,255,0.55)', fontSize: '0.78rem', marginBottom: '24px' }}>{t('pricing_custom')}</div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features[lang].map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(185,200,255,0.8)' }}>
                      <Check size={14} className="mt-0.5 shrink-0" style={{ color: plan.highlight ? '#818cf8' : '#6366f1' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate(`/signup?intent=plan&plan=${plan.id}&label=${encodeURIComponent(plan.name[lang])}`)} className={plan.highlight ? 'btn-primary w-full text-center' : 'btn-outline w-full justify-center'}>
                  {plan.id === 'extra' ? t('pricing_cta_extra') : t('pricing_cta_default')}
                </button>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Compare toggle */}
        <Reveal delay={0.15}>
          <div className="mt-12 text-center">
            <button
              onClick={() => setCompareOpen((v) => !v)}
              className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all"
              style={{ color: '#a5b4fc', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}
              aria-expanded={compareOpen}
            >
              {compareOpen ? t('pricing_compare_hide') : t('pricing_compare_toggle')}
              <ChevronDown size={15} style={{ transform: compareOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }} />
            </button>
          </div>
        </Reveal>

        {compareOpen && (
          <Reveal delay={0}>
            <div className="mt-8 glass-dark rounded-2xl p-4 md:p-6 overflow-x-auto">
              <table className="compare-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th></th>
                    {displayPlans.map((p) => (
                      <th key={p.id} className={p.highlight ? 'col-highlight' : ''}>{p.name[lang]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_COMPARISON.map((row, i) => (
                    <tr key={i}>
                      <td>{row.label[lang]}</td>
                      <td><CompareCell value={row.low} lang={lang} /></td>
                      <td className="col-highlight"><CompareCell value={row.medium} lang={lang} highlight /></td>
                      <td><CompareCell value={row.max} lang={lang} /></td>
                      <td><CompareCell value={row.extra} lang={lang} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        )}

        {/* Promo banner */}
        <Reveal delay={0.2}>
          <div
            className="mt-10 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-4"
            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.12))', border: '1px solid rgba(99,102,241,0.3)' }}
          >
            <div>
              <div className="font-black text-white text-lg">🎁 {t('pricing_promo_title')}</div>
              <div style={{ color: 'rgba(180,195,255,0.75)', fontSize: '0.875rem', marginTop: '4px' }}>{t('pricing_promo_sub')}</div>
            </div>
            <button onClick={() => navigate(`/signup?intent=plan&plan=promo&label=${encodeURIComponent(t('pricing_promo_title'))}`)} className="btn-primary shrink-0">{t('pricing_promo_cta')}</button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
