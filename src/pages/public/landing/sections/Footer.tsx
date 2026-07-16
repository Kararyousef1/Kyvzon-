import React from 'react';
import { useLang } from '../LangContext';
import { useNavigate } from 'react-router-dom';
import type { LandingConfig } from '../../../../shared/types/landing';
import type { PublicSiteConfig } from '../../../../services/sdk';
import { FacebookIcon, InstagramIcon, LinkedInIcon, XIcon, WhatsAppIcon } from '../ui/SocialIcons';

/**
 * روابط التواصل الاجتماعي — أضف روابط صفحاتك الفعلية هنا
 * مثال: { Icon: FacebookIcon, href: 'https://facebook.com/yourpage', label: 'Facebook' }
 */
const SOCIAL_LINKS: { Icon: React.ComponentType<{ size?: number }>; href: string; label: string }[] = [];

export function Footer({ landingConfig, publicConfig }: { landingConfig?: Partial<LandingConfig> | null; publicConfig?: PublicSiteConfig }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const productLinks = [
    { label: t('nav_portals'), action: () => navigate('/portals') },
    { label: t('nav_pricing'), action: () => scrollTo('pricing') },
    { label: t('nav_services'), action: () => scrollTo('services') },
    { label: t('footer_faq'), action: () => scrollTo('faq') },
  ];

  const pageMap = Object.fromEntries((publicConfig?.pages || []).filter(p => p.enabled !== false).map(p => [p.kind, p]));
  const companyLinks = [
    { label: pageMap.about?.title || t('footer_about'), href: '/about' },
    { label: pageMap.careers?.title || t('footer_careers'), href: '/careers' },
    { label: pageMap.blog?.title || t('footer_blog'), href: '/blog' },
    { label: pageMap.contact?.title || t('footer_contact'), href: '/contact' },
  ];
  const resourceLinks = [
    { label: pageMap.support?.title || t('footer_support'), href: '/support' },
    { label: t('footer_pricing'), action: () => scrollTo('pricing') },
    { label: t('footer_faq'), action: () => scrollTo('faq') },
    { label: pageMap.status?.title || t('footer_status'), href: '/status' },
  ];
  const legalLinks = [
    { label: pageMap.privacy?.title || t('footer_privacy'), href: '/privacy' },
    { label: pageMap.terms?.title || t('footer_terms'), href: '/terms' },
    { label: pageMap.security?.title || t('footer_security'), href: '/security' },
  ];

  return (
    <footer style={{ backgroundColor: 'var(--kv-bg-deep)', borderTop: '1px solid var(--kv-border-soft)' }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-16 pb-10">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm">K</div>
              <span className="font-black text-white text-lg">{landingConfig?.logoTextEn || 'KYVZON'}</span>
            </div>
            <p style={{ color: 'rgba(180,195,255,0.55)', fontSize: '0.875rem', lineHeight: '1.8', maxWidth: '22rem' }}>
              {(landingConfig?.aboutP1Ar || landingConfig?.aboutP1En) || t('footer_tagline')}
            </p>
            <div className="flex items-center gap-2 mt-5">
              {SOCIAL_LINKS.map(({ Icon, href, label }) => (
                <a key={label} href={href} className="icon-btn" aria-label={label} target="_blank" rel="noopener noreferrer">
                  <Icon size={15} />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <div className="text-white font-bold text-sm mb-4">{t('footer_col_product')}</div>
            <ul className="flex flex-col gap-3">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <button onClick={l.action} style={{ color: 'rgba(180,195,255,0.6)', fontSize: '0.85rem' }} className="hover:text-white transition-colors text-start">
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <div className="text-white font-bold text-sm mb-4">{t('footer_col_company')}</div>
            <ul className="flex flex-col gap-3">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <button onClick={() => navigate(l.href)} style={{ color: 'rgba(180,195,255,0.6)', fontSize: '0.85rem' }} className="hover:text-white transition-colors text-start">{l.label}</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <div className="text-white font-bold text-sm mb-4">{t('footer_col_resources')}</div>
            <ul className="flex flex-col gap-3">
              {resourceLinks.map((l) => (
                <li key={l.label}>
                  <button onClick={() => ('href' in l && l.href ? navigate(l.href) : l.action?.())} style={{ color: 'rgba(180,195,255,0.6)', fontSize: '0.85rem' }} className="hover:text-white transition-colors text-start">{l.label}</button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8"
          style={{ borderTop: '1px solid var(--kv-border-soft)' }}
        >
          <div className="text-white/30 text-xs order-3 md:order-1">
            © {new Date().getFullYear()} KYVZON · {t('footer_rights')}
          </div>
          <div className="flex items-center gap-2 order-2" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
            🇮🇶 {t('footer_made_in')}
          </div>
          <div className="flex items-center gap-5 order-1 md:order-3">
            {legalLinks.map((l) => (
              <button key={l.label} onClick={() => navigate(l.href)} style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem' }} className="hover:text-white/70 transition-colors">
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
