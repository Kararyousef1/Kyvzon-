import React from 'react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { StatCounter } from '../ui/StatCounter';
import { STATS, INDUSTRIES } from '../data';

export function SocialProof() {
  const { lang, t } = useLang();
  // نكرر القائمة مرتين لضمان استمرارية شريط الحركة (marquee) دون فجوة
  const loopedIndustries = [...INDUSTRIES, ...INDUSTRIES];

  return (
    <section className="py-16 md:py-20 relative" style={{ backgroundColor: 'var(--kv-bg-alt)', borderTop: '1px solid var(--kv-border-soft)', borderBottom: '1px solid var(--kv-border-soft)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-10">
          <p style={{ color: 'var(--kv-text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>{t('social_sub')}</p>
        </Reveal>

        {/* Stats */}
        <Reveal delay={0.05}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {STATS.map((s, i) => (
              <div key={i} className="stat-card">
                <div className="w-9 h-9 rounded-lg mx-auto mb-2.5 flex items-center justify-center" style={{ background: 'var(--kv-accent-soft)' }}>
                  <s.icon size={16} style={{ color: 'var(--kv-accent-1)' }} />
                </div>
                <StatCounter value={s.value} suffix={s.suffix} className="text-2xl md:text-3xl font-black text-white" />
                <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.72rem', marginTop: 4, lineHeight: 1.4 }}>{s.label[lang]}</div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Industries marquee — تُستبدل بشعارات عملاء حقيقيين عند توفرها */}
        <div className="kv-marquee">
          <div className="kv-marquee-track">
            {loopedIndustries.map((ind, i) => (
              <div key={i} className="flex items-center gap-2.5 px-6 py-2 shrink-0" style={{ opacity: 0.55 }}>
                <ind.icon size={16} style={{ color: 'var(--kv-text-muted)' }} />
                <span style={{ color: 'var(--kv-text-muted)', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {ind.label[lang]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
