import React from 'react';
import { Star, Quote, MessageSquare } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { TESTIMONIALS } from '../data';
import { useNavigate } from 'react-router-dom';

export function Testimonials() {
  const { lang, t } = useLang();
  const navigate = useNavigate();

  return (
    <section id="testimonials" className="relative" style={{ backgroundColor: 'var(--kv-bg-void)', paddingBlock: 'var(--kv-section-y)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-16">
          <div className="section-label"><MessageSquare size={12} /> {t('testi_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('testi_title')}</h2>
          <p style={{ marginTop: '16px', color: 'var(--kv-text-body)', maxWidth: '36rem', margin: '16px auto 0' }}>{t('testi_sub')}</p>
          <button
            type="button"
            onClick={() => navigate('/signup?intent=review&label=review')}
            className="btn-primary mt-6 inline-flex"
          >
            {lang === 'en' ? 'Add your review' : lang === 'ku' ? 'هەڵسەنگاندنت زیاد بکە' : 'أضف تقييمك'}
          </button>
        </Reveal>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((testimonial, i) => (
            <Reveal key={testimonial.id} delay={i * 0.08}>
              <div className="testimonial-card flex flex-col">
                <Quote size={26} style={{ color: `${testimonial.color}55`, marginBottom: 12 }} />
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: testimonial.rating }).map((_, s) => (
                    <Star key={s} size={13} fill="#fbbf24" style={{ color: '#fbbf24' }} />
                  ))}
                </div>
                <p style={{ color: 'var(--kv-text-body)', fontSize: '0.9rem', lineHeight: '1.8', flex: 1 }}>
                  {testimonial.quote[lang]}
                </p>
                <div className="flex items-center gap-3 mt-6 pt-5" style={{ borderTop: '1px solid var(--kv-border)' }}>
                  <div
                    className="flex items-center justify-center rounded-xl font-black shrink-0"
                    style={{ width: 40, height: 40, background: `${testimonial.color}22`, color: testimonial.color, fontSize: '0.8rem' }}
                  >
                    {testimonial.initials}
                  </div>
                  <div>
                    <div className="text-white font-bold text-sm">{testimonial.name}</div>
                    <div style={{ color: 'var(--kv-text-muted)', fontSize: '0.72rem', marginTop: 1 }}>{testimonial.role[lang]}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
