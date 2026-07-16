import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { FAQS } from '../data';
import { useNavigate } from 'react-router-dom';

export function FAQSection({ onLoginClick }: { onLoginClick: () => void }) {
  const { lang, isRTL, t } = useLang();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(FAQS[0]?.id ?? null);

  return (
    <section id="faq" className="py-24 md:py-32" style={{ backgroundColor: 'var(--kv-bg-alt)' }}>
      <div className="max-w-3xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-14">
          <div className="section-label"><HelpCircle size={12} /> {t('faq_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('faq_title')}</h2>
          <p style={{ marginTop: '16px', color: 'rgba(180,190,255,0.75)' }}>{t('faq_sub')}</p>
        </Reveal>

        <div className="flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const isOpen = openId === item.id;
            return (
              <Reveal key={item.id} delay={i * 0.04}>
                <div className={`faq-item ${isOpen ? 'open' : ''}`}>
                  <button
                    className="faq-question"
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${item.id}`}
                  >
                    <span>{item.q[lang]}</span>
                    <ChevronDown size={18} className="faq-chevron" style={{ color: 'rgba(255,255,255,0.4)' }} />
                  </button>
                  <div className="faq-answer-grid">
                    <div className="faq-answer-inner">
                      <div id={`faq-panel-${item.id}`} className="faq-answer-content" role="region">
                        {item.a[lang]}
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={0.1}>
          <div className="mt-12 text-center rounded-2xl p-8" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.18)' }}>
            <div className="text-white font-bold mb-4">{t('faq_still_question')}</div>
            <button onClick={() => navigate('/signup?intent=demo&label=FAQ')} className="btn-primary inline-flex">
              {t('faq_talk_to_us')}
              {isRTL ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
