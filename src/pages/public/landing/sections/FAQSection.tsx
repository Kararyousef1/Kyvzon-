import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ArrowLeft, ArrowRight, MessageCircle } from 'lucide-react';
import { useLang } from '../LangContext';
import { Reveal } from '../ui/Reveal';
import { FAQS } from '../data';
import { useNavigate } from 'react-router-dom';

export function FAQSection({ onLoginClick }: { onLoginClick: () => void }) {
  const { lang, isRTL, t } = useLang();
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(FAQS[0]?.id ?? null);

  return (
    <section id="faq" className="relative py-24 md:py-32 overflow-hidden" style={{ backgroundColor: 'var(--kv-bg-alt)' }}>
      <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-indigo-600/07 blur-[120px] pointer-events-none" aria-hidden="true" />

      <div className="relative max-w-3xl mx-auto px-4 md:px-8">
        <Reveal className="text-center mb-14">
          <div className="section-label"><HelpCircle size={12} /> {t('faq_label')}</div>
          <h2 className="section-title text-3xl md:text-4xl font-black text-white mt-2">{t('faq_title')}</h2>
          <p style={{ marginTop: '16px', color: 'var(--kv-text-body)' }}>{t('faq_sub')}</p>
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
                    <span className="flex items-center gap-3">
                      {/* رقم السؤال — لمسة تحريرية أنيقة */}
                      <span
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black transition-all duration-300"
                        style={{
                          background: isOpen ? 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(34,211,238,0.2))' : 'rgba(255,255,255,0.05)',
                          color: isOpen ? '#a5b4fc' : 'rgba(255,255,255,0.35)',
                          border: isOpen ? '1px solid rgba(129,140,248,0.5)' : '1px solid transparent',
                        }}
                        aria-hidden="true"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>{item.q[lang]}</span>
                    </span>
                    <ChevronDown size={18} className="faq-chevron" style={{ color: 'rgba(255,255,255,0.4)' }} />
                  </button>
                  <div className="faq-answer-grid">
                    <div className="faq-answer-inner">
                      <div id={`faq-panel-${item.id}`} className="faq-answer-content" role="region" style={{ paddingInlineStart: 62 }}>
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
          <div
            className="mt-12 text-center rounded-3xl p-9 relative overflow-hidden"
            style={{
              background: 'linear-gradient(rgba(13,16,40,0.85), rgba(13,16,40,0.85)) padding-box, linear-gradient(135deg, rgba(129,140,248,0.5), rgba(34,211,238,0.3)) border-box',
              border: '1px solid transparent',
            }}
          >
            <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(34,211,238,0.15))', boxShadow: 'var(--kv-glow-sm)' }}>
              <MessageCircle size={20} style={{ color: '#a5b4fc' }} />
            </div>
            <div className="text-white font-black text-lg mb-4">{t('faq_still_question')}</div>
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
