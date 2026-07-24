/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ContactFab — زر تواصل عائم (Floating Action Button) لصفحة الهبوط
 *
 *  عند الضغط تُفتح نافذة صغيرة بخيارات: واتساب · بريد · هاتف.
 *  البيانات من publicConfig (supportPhone / supportEmail) مع قيم افتراضية.
 * ════════════════════════════════════════════════════════════════════════════
 */
import React, { useState } from 'react';
import { MessageCircle, X, Mail, Phone } from 'lucide-react';
import { useLang } from '../LangContext';
import type { PublicSiteConfig } from '../../../../services/sdk';

interface ContactFabProps {
  publicConfig?: PublicSiteConfig;
}

/** ينظّف الرقم لصيغة واتساب/اتصال (أرقام فقط، بلا مسافات أو رموز) */
function cleanPhone(raw: string): string {
  return (raw || '').replace(/[^\d]/g, '');
}

export function ContactFab({ publicConfig }: ContactFabProps) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);

  const phoneRaw = publicConfig?.supportPhone || '';
  const email = publicConfig?.supportEmail || 'hello@kyvzon.com';
  const phoneDigits = cleanPhone(phoneRaw);
  const hasPhone = phoneDigits.length >= 7; // رقم صالح

  const L = {
    title: { ar: 'تواصل معنا', en: 'Contact us', ku: 'پەیوەندیمان پێوە بکە' },
    subtitle: { ar: 'كيف تحب أن نساعدك؟', en: 'How can we help?', ku: 'چۆن یارمەتیت بدەین؟' },
    whatsapp: { ar: 'واتساب', en: 'WhatsApp', ku: 'واتساپ' },
    whatsappSub: { ar: 'رد سريع خلال دقائق', en: 'Quick reply in minutes', ku: 'وەڵامی خێرا' },
    email: { ar: 'راسلنا بالبريد', en: 'Email us', ku: 'ئیمەیڵمان بۆ بنێرە' },
    call: { ar: 'اتصل بنا', en: 'Call us', ku: 'پەیوەندیمان پێوە بکە' },
    open: { ar: 'فتح نافذة التواصل', en: 'Open contact menu', ku: 'کردنەوەی لیستی پەیوەندی' },
    close: { ar: 'إغلاق', en: 'Close', ku: 'داخستن' },
  } as const;

  return (
    <div style={{ position: 'fixed', bottom: 24, insetInlineStart: 24, zIndex: 60 }}>
      {/* نافذة الخيارات */}
      {open && (
        <div
          role="dialog"
          aria-label={L.title[lang]}
          style={{
            position: 'absolute', bottom: 64, insetInlineStart: 0,
            width: 260, borderRadius: 20, overflow: 'hidden',
            background: '#fff', border: '1px solid var(--kv-border)',
            boxShadow: 'var(--kv-glow-lg)',
            animation: 'kv-fadeUp 0.25s var(--kv-ease-out) both',
          }}
        >
          {/* رأس النافذة */}
          <div style={{ background: 'var(--kv-accent-grad)', padding: '16px 18px', color: '#fff' }}>
            <div style={{ fontWeight: 800, fontSize: '1rem' }}>{L.title[lang]}</div>
            <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: 2 }}>{L.subtitle[lang]}</div>
          </div>

          {/* الخيارات */}
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hasPhone && (
              <a
                href={`https://wa.me/${phoneDigits}`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="mockup-row"
                style={{ textDecoration: 'none' }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 12, background: '#e8f9ef', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MessageCircle size={20} style={{ color: '#16a34a' }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, color: 'var(--kv-text-hi)', fontSize: '0.9rem' }}>{L.whatsapp[lang]}</span>
                  <span style={{ display: 'block', color: 'var(--kv-text-muted)', fontSize: '0.75rem' }}>{L.whatsappSub[lang]}</span>
                </span>
              </a>
            )}

            <a
              href={`mailto:${email}`}
              onClick={() => setOpen(false)}
              className="mockup-row"
              style={{ textDecoration: 'none' }}
            >
              <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--kv-bg-deep)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail size={19} style={{ color: 'var(--kv-accent-1)' }} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, color: 'var(--kv-text-hi)', fontSize: '0.9rem' }}>{L.email[lang]}</span>
                <span style={{ display: 'block', color: 'var(--kv-text-muted)', fontSize: '0.75rem', direction: 'ltr', textAlign: lang === 'en' ? 'left' : 'right' }}>{email}</span>
              </span>
            </a>

            {hasPhone && (
              <a
                href={`tel:${phoneDigits}`}
                onClick={() => setOpen(false)}
                className="mockup-row"
                style={{ textDecoration: 'none' }}
              >
                <span style={{ width: 40, height: 40, borderRadius: 12, background: '#f3effe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Phone size={18} style={{ color: '#7c3aed' }} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, color: 'var(--kv-text-hi)', fontSize: '0.9rem' }}>{L.call[lang]}</span>
                  <span style={{ display: 'block', color: 'var(--kv-text-muted)', fontSize: '0.75rem', direction: 'ltr', textAlign: lang === 'en' ? 'left' : 'right' }}>{phoneRaw}</span>
                </span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* الزر العائم */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? L.close[lang] : L.open[lang]}
        aria-expanded={open}
        style={{
          width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'var(--kv-accent-grad)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 30px -6px rgba(12,141,231,0.55)',
          transition: 'transform 0.25s var(--kv-ease-spring)',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
      </button>
    </div>
  );
}
