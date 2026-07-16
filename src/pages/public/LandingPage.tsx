/**
 * ════════════════════════════════════════════════════════════════
 *  LandingPage — KYVZON SaaS ERP
 *  الشركة: KYVZON | العراق
 *  اللغات: العربية · الإنجليزية · الكردية
 *
 *  هذا الملف أصبح "أوركستريتور" رفيع فقط: يجمع مكوّنات الأقسام من
 *  ./landing/sections ويمرّر لها الحالة المشتركة (اللغة، التمرير).
 *  كل قسم بات مكوّناً مستقلاً قابلاً للتطوير والاختبار بمفرده.
 * ════════════════════════════════════════════════════════════════
 */
import React, { useEffect, useState } from 'react';
import './landing/styles.css';

import { LangProvider, useLang } from './landing/LangContext';
import { useScrollMeta, useScrollSpy } from './landing/hooks';

import { Header } from './landing/sections/Header';
import { Hero } from './landing/sections/Hero';
import { SocialProof } from './landing/sections/SocialProof';
import { Portals } from './landing/sections/Portals';
import { Screenshots } from './landing/sections/Screenshots';
import { WhyKyvzon } from './landing/sections/WhyKyvzon';
import { Testimonials } from './landing/sections/Testimonials';
import { Pricing } from './landing/sections/Pricing';
import { Services } from './landing/sections/Services';
import { FAQSection } from './landing/sections/FAQSection';
import { CTABanner } from './landing/sections/CTABanner';
import { Contact } from './landing/sections/Contact';
import { Footer } from './landing/sections/Footer';
import { ScrollChrome } from './landing/sections/ScrollChrome';

import type { LandingPageProps } from './landing/types';
import type { LandingConfig } from '../../shared/types/landing';
import { settingsService, publicSiteConfigService, DEFAULT_PUBLIC_SITE_CONFIG, type PublicSiteConfig } from '../../services/sdk';

const SCROLL_SPY_IDS = ['home', 'portals', 'pricing', 'services', 'faq', 'contact'];

/** يضبط عنوان الصفحة ووصفها التعريفي بحسب اللغة الحالية — تحسين بسيط للـ SEO بلا أي تبعية إضافية */
function useDocumentMeta() {
  const { lang } = useLang();
  useEffect(() => {
    const titles = {
      ar: 'KYVZON — نظام ERP سحابي متكامل لإدارة مؤسستك',
      en: 'KYVZON — Complete Cloud ERP System for Your Organization',
      ku: 'KYVZON — سیستەمی ERP ئەبری بۆ بەڕێوەبردنی دامەزراوەکەت',
    } as const;
    const descriptions = {
      ar: 'منصة KYVZON تجمع بوابات الموظف وHR والإدارة والمدير والمشرف والحركة والتواصل والتقنية مع تحكم SaaS مركزي بالاشتراكات والتفعيل.',
      en: 'KYVZON combines employee, HR, admin, manager, supervisor, movement, communication and tech portals with centralized SaaS subscription control.',
      ku: 'KYVZON دەروازەکانی کارمەند، HR، بەڕێوەبەرایەتی، جووڵە، پەیوەندی و تەکنیک یەکدەخات.',
    } as const;

    document.title = titles[lang];
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', descriptions[lang]);
  }, [lang]);
}

function LandingPageContent({ onLoginClick, previewMode }: LandingPageProps) {
  const [landingConfig, setLandingConfig] = useState<(LandingConfig & { portalVisibility?: Record<string, boolean> }) | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig>(DEFAULT_PUBLIC_SITE_CONFIG);
  const { lang, isRTL, t } = useLang();
  const { scrolled, scrollPct, showTop } = useScrollMeta();
  const activeSection = useScrollSpy(SCROLL_SPY_IDS);
  useDocumentMeta();


  useEffect(() => {
    let cancelled = false;
    Promise.all([
      settingsService.findLandingConfig().catch(() => null),
      publicSiteConfigService.getConfig().catch(() => DEFAULT_PUBLIC_SITE_CONFIG),
    ]).then(([landing, publicSite]) => {
      if (cancelled) return;
      setLandingConfig(landing as (LandingConfig & { portalVisibility?: Record<string, boolean> }) | null);
      setPublicConfig(publicSite);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="kv-root min-h-screen" lang={lang}>
      <a href="#main-content" className="kv-skip-link">{t('skip_to_content')}</a>

      <ScrollChrome scrollPct={scrollPct} showTop={showTop} />
      <Header onLoginClick={onLoginClick} scrolled={scrolled} activeSection={activeSection} landingConfig={landingConfig} />

      <main id="main-content">
        <Hero onLoginClick={onLoginClick} landingConfig={landingConfig} publicConfig={publicConfig} />
        <SocialProof />
        <Portals onLoginClick={onLoginClick} previewMode={previewMode} portalVisibility={landingConfig?.portalVisibility} publicConfig={publicConfig} />
        <Screenshots />
        <WhyKyvzon />
        <Testimonials />
        <Pricing onLoginClick={onLoginClick} publicConfig={publicConfig} />
        <Services publicConfig={publicConfig} />
        <FAQSection onLoginClick={onLoginClick} />
        <CTABanner onLoginClick={onLoginClick} publicConfig={publicConfig} />
        <Contact landingConfig={landingConfig} publicConfig={publicConfig} />
      </main>

      <Footer landingConfig={landingConfig} publicConfig={publicConfig} />
    </div>
  );
}

export default function LandingPage(props: LandingPageProps) {
  return (
    <LangProvider>
      <LandingPageContent {...props} />
    </LangProvider>
  );
}