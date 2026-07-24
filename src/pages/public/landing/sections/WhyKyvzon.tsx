import React from 'react';
import { Award } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { StatCounter } from '../ui/StatCounter';
import { WHY_REASONS, STATS } from '../data';

export function WhyKyvzon() {
  const { lang, t } = useLang();

  return (
    <section className="kv-section kv-section--alt relative overflow-hidden">
      <div className="kv-glow-orb" style={{ inset: '-12% auto auto -8%', width: 420, height: 420, background: 'rgba(56,166,240,0.10)' }} aria-hidden="true" />

      <div className="kv-container relative">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* عمود النص + الأسباب */}
          <Reveal>
            <span className="kv-eyebrow"><Award size={13} /> {t('why_label')}</span>
            <h2 className="kv-h2 mt-4 mb-5">{t('why_title')}</h2>
            <p style={{ color: 'var(--kv-text-body)', lineHeight: 'var(--kv-lh-relaxed)', marginBottom: 'var(--kv-space-6)', fontSize: 'var(--kv-fs-lead)' }}>
              {t('why_desc')}
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              {WHY_REASONS.map((it, i) => (
                <div key={i} className="kv-card flex items-start gap-3" style={{ padding: '1rem 1.1rem' }}>
                  <div className="kv-icon-box" style={{ width: 40, height: 40, borderRadius: 12 }}>
                    <it.icon size={17} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--kv-text-hi)', lineHeight: 1.3 }}>{it.title[lang]}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--kv-text-muted)', marginTop: 4, lineHeight: 1.55 }}>{it.desc[lang]}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* عمود بصري — بطاقة العراق */}
          <Reveal delay={0.15}>
            <div className="kv-card" style={{ padding: 'clamp(1.75rem, 4vw, 2.5rem)', background: 'linear-gradient(160deg, #ffffff, var(--kv-accent-soft))' }}>
              <div className="text-center" style={{ marginBottom: 'var(--kv-space-6)' }}>
                <div className="text-6xl mb-3 anim-float inline-block">🇮🇶</div>
                <div className="text-2xl font-black" style={{ color: 'var(--kv-text-hi)' }}>العراق — Iraq</div>
                <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.9rem', marginTop: 4 }}>بغداد · Baghdad</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { v: '11', l: { ar: 'بوابة', en: 'Portals', ku: 'دەروازە' } },
                  { v: '∞', l: { ar: 'موظفون', en: 'Employees', ku: 'کارمەند' } },
                  { v: '3', l: { ar: 'لغات', en: 'Languages', ku: 'زمان' } },
                  { v: '24/7', l: { ar: 'دعم', en: 'Support', ku: 'پشتگیری' } },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl p-4 text-center" style={{ background: '#fff', border: '1px solid var(--kv-border)' }}>
                    <div className="text-2xl font-black" style={{ color: 'var(--kv-accent-1)' }}>{s.v}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--kv-text-muted)' }}>{s.l[lang]}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* شريط الإحصائيات */}
        {STATS.length > 0 && (
          <Reveal delay={0.1}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginTop: 'var(--kv-space-10)', paddingTop: 'var(--kv-space-8)', borderTop: '1px solid var(--kv-border)' }}>
              <div className="col-span-2 md:col-span-4 mb-1 text-center" style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--kv-text-muted)', letterSpacing: '0.06em' }}>
                {t('why_kpi_label')}
              </div>
              {STATS.map((s, i) => (
                <div key={i} className="text-center">
                  <StatCounter value={s.value} suffix={s.suffix} className="text-2xl md:text-3xl font-black" />
                  <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.8rem', marginTop: 4 }}>{s.label[lang]}</div>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
