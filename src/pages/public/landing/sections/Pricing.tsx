import React, { useState } from 'react';
import { Star, Users, Check, X, ChevronDown, ShieldCheck, RefreshCw, LifeBuoy, Download } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { PLANS, PLAN_COMPARISON } from '../data';
import type { CompareValue } from '../data';
import type { PublicSiteConfig } from '../../../../services/sdk';

function CompareCell({ value, lang, highlight }: { value: CompareValue; lang: 'ar' | 'en' | 'ku'; highlight?: boolean }) {
  if (typeof value === 'boolean') {
    return value
      ? <Check size={16} style={{ color: highlight ? 'var(--kv-accent-2)' : 'var(--kv-accent-1)', margin: '0 auto', filter: 'none' }} />
      : <X size={14} style={{ color: 'var(--kv-text-faint)', margin: '0 auto' }} />;
  }
  const text = typeof value === 'string' ? value : value[lang];
  return <span style={{ color: highlight ? 'var(--kv-accent-2)' : 'var(--kv-text-body)', fontWeight: 600 }}>{text}</span>;
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
  const displayPlans = (publicConfig?.plans?.filter(p => p.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) || PLANS);

  return (
    <section id="pricing" className="relative overflow-hidden" style={{ backgroundColor: 'var(--kv-bg-alt)', paddingBlock: 'var(--kv-section-y)' }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="anim-aurora absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[600px] rounded-full bg-sky-400/[0.08] blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-sky-300/[0.06] blur-[110px]" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-16">
          <div className="section-label"><Star size={12} /> {t('pricing_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('pricing_title')}</h2>
          <p style={{ marginTop: '16px', color: 'var(--kv-text-body)', maxWidth: '36rem', margin: '16px auto 0' }}>{t('pricing_sub')}</p>
        </Reveal>

        {/* Guarantees — كبسولات زجاجية بدل صف مسطح */}
        <Reveal delay={0.05}>
          <div className="flex flex-wrap justify-center gap-2.5 mb-14">
            {GUARANTEES.map(({ icon: Icon, key }) => (
              <div
                key={key}
                className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 hover:-translate-y-0.5"
                style={{ background: '#fff', border: '1px solid var(--kv-border)', boxShadow: 'var(--kv-glow-sm)' }}
              >
                <Icon size={13} style={{ color: 'var(--kv-accent-1)' }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--kv-text-hi)', fontWeight: 700 }}>{t(key)}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {displayPlans.map((plan, i) => (
            <Reveal key={plan.id} delay={i * 0.1}>
              <div className={`price-card h-full flex flex-col relative ${plan.highlight ? 'highlight lg:-mt-4 lg:mb-[-16px] lg:pt-10' : ''}`}>
                {/* شريط علوي مضيء للخطة المميزة */}
                {plan.highlight && (
                  <div
                    className="absolute top-0 left-6 right-6 h-1 rounded-b-full"
                    style={{ background: 'var(--kv-accent-grad-full)', boxShadow: '0 0 16px rgba(0,87,160,0.3)' }}
                    aria-hidden="true"
                  />
                )}
                {plan.badge && (
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4 self-start"
                    style={{
                      background: 'var(--kv-bg-deep)',
                      color: 'var(--kv-text-body)',
                      border: plan.highlight ? '1px solid rgba(12,141,231,0.35)' : '1px solid transparent',
                      boxShadow: 'none',
                    }}
                  >
                    {plan.highlight && <Star size={11} fill="#bfdbfe" />}
                    {plan.badge[lang]}
                  </div>
                )}
                <div className={`text-xl font-black tracking-widest mb-1 ${plan.highlight ? 'kv-gradient-text' : 'text-white'}`}>{plan.name[lang]}</div>
                <div style={{ color: 'var(--kv-text-body)', fontSize: '0.875rem', marginBottom: '24px' }}>{plan.desc[lang]}</div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Users size={16} style={{ color: plan.highlight ? 'var(--kv-accent-2)' : 'var(--kv-accent-1)', flexShrink: 0 }} />
                  <span className="text-xl font-black text-white">{plan.range[lang]}</span>
                </div>
                <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.78rem', marginBottom: '24px' }}>{t('pricing_custom')}</div>
                <ul className="space-y-3 flex-1 mb-8">
                  {plan.features[lang].map((f, fi) => (
                    <li key={fi} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(185,200,255,0.8)' }}>
                      <Check size={14} className="mt-0.5 shrink-0" style={{ color: plan.highlight ? 'var(--kv-accent-1)' : 'var(--kv-accent-1)', filter: 'none' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    // تفعيل الخطة يتطلب تسجيل الدخول — نحفظ نيّة الخطة ثم نفتح الدخول
                    try { sessionStorage.setItem('kv_intended_plan', JSON.stringify({ planId: plan.id, label: plan.name[lang] })); } catch { /* noop */ }
                    onLoginClick();
                  }}
                  className={plan.highlight ? 'btn-primary w-full text-center' : 'btn-outline w-full justify-center'}
                >
                  {plan.id === 'extra' ? t('pricing_cta_extra') : t('pricing_cta_default')}
                </button>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Compare toggle */}
        <Reveal delay={0.15}>
          <div className="mt-14 text-center">
            <button
              onClick={() => setCompareOpen((v) => !v)}
              className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-2xl transition-all duration-300 hover:-translate-y-0.5"
              style={{ color: 'var(--kv-accent-2)', background: 'var(--kv-bg-deep)', border: '1px solid #d6e9fb', boxShadow: compareOpen ? 'var(--kv-glow-sm)' : 'none' }}
              aria-expanded={compareOpen}
            >
              {compareOpen ? t('pricing_compare_hide') : t('pricing_compare_toggle')}
              <ChevronDown size={15} style={{ transform: compareOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s ease' }} />
            </button>
          </div>
        </Reveal>

        {compareOpen && (
          <Reveal delay={0}>
            <div className="mt-8 rounded-3xl p-4 md:p-6 overflow-x-auto" style={{ background: "#fff", border: "1px solid var(--kv-border)", boxShadow: "var(--kv-shadow-sm)" }}>
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

        {/* Promo banner — لافتة أورورا متوهجة */}
        <Reveal delay={0.2}>
          <div
            className="relative mt-12 rounded-3xl p-6 md:p-9 flex flex-col md:flex-row items-center justify-between gap-5 overflow-hidden"
            style={{
              background: 'var(--kv-accent-grad)',
              boxShadow: 'var(--kv-glow-lg)',
            }}
          >
            <div className="relative">
              <div className="font-black text-lg md:text-xl" style={{ color: '#fff' }}>🎁 {t('pricing_promo_title')}</div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem', marginTop: '6px' }}>{t('pricing_promo_sub')}</div>
            </div>
            <button
              onClick={() => {
                try { sessionStorage.setItem('kv_intended_plan', JSON.stringify({ planId: 'promo', label: t('pricing_promo_title') })); } catch { /* noop */ }
                onLoginClick();
              }}
              className="btn-primary shrink-0 relative"
              style={{ background: '#fff', color: 'var(--kv-accent-3)' }}
            >{t('pricing_promo_cta')}</button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
