import React from 'react';
import { Phone, Mail, MapPin } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import type { LandingConfig } from '../../../../shared/types/landing';
import type { PublicSiteConfig } from '../../../../services/sdk';

const CONTACT_ITEMS = [
  { icon: Phone, color: 'var(--kv-accent-1)', title: { ar: 'الهاتف', en: 'Phone', ku: 'تەلەفۆن' }, val: { ar: '+964 XXX XXX XXXX', en: '+964 XXX XXX XXXX', ku: '+964 XXX XXX XXXX' } },
  { icon: Mail, color: 'var(--kv-accent-sky)', title: { ar: 'البريد', en: 'Email', ku: 'ئیمەیڵ' }, val: { ar: 'hello@kyvzon.com', en: 'hello@kyvzon.com', ku: 'hello@kyvzon.com' } },
  { icon: MapPin, color: '#16a34a', title: { ar: 'الموقع', en: 'Location', ku: 'شوێن' }, val: { ar: 'بغداد، العراق', en: 'Baghdad, Iraq', ku: 'بەغداد، عێراق' } },
];

export function Contact({ landingConfig, publicConfig }: { landingConfig?: Partial<LandingConfig> | null; publicConfig?: PublicSiteConfig }) {
  const { lang, t } = useLang();

  return (
    <section id="contact" className="relative" style={{ backgroundColor: 'var(--kv-bg-alt)', paddingBlock: 'var(--kv-section-y)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-14">
          <div className="section-label"><Phone size={12} /> {t('contact_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('contact_title')}</h2>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5">
          {CONTACT_ITEMS.map((item, i) => {
            const c = i === 0 ? { ...item, val: { ar: publicConfig?.supportPhone || landingConfig?.phone || item.val.ar, en: publicConfig?.supportPhone || landingConfig?.phone || item.val.en, ku: publicConfig?.supportPhone || landingConfig?.phone || item.val.ku } } : i === 1 ? { ...item, val: { ar: publicConfig?.supportEmail || landingConfig?.email || item.val.ar, en: publicConfig?.supportEmail || landingConfig?.email || item.val.en, ku: publicConfig?.supportEmail || landingConfig?.email || item.val.ku } } : item;
            return (
            <Reveal key={i} delay={i * 0.1}>
              <div className="service-card text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center" style={{ background: `${c.color}18` }}>
                  <c.icon size={22} style={{ color: c.color }} />
                </div>
                <div className="font-bold text-white mb-1">{c.title[lang]}</div>
                <div style={{ color: 'var(--kv-text-body)', fontSize: '0.875rem' }} dir="ltr">{c.val[lang]}</div>
              </div>
            </Reveal>
          );
          })}
        </div>
      </div>
    </section>
  );
}
