/**
 * ════════════════════════════════════════════════════════════════
 *  LandingPage - صفحة الزوار العامة (النسخة الكاملة + مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة في هذه النسخة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ تنظيف جميع markdown artifacts (HTML entities + روابط مكسورة)
 *  ✅ إصلاح القوالب المكسورة: className=`...`}  →  className={`...`}
 *  ✅ إصلاح الاستدعاءات المكسورة: setUserLocation`...`)  →  setUserLocation(`...`)
 *  ✅ إزالة كل any → أنواع صريحة (LandingProduct / LandingAgent / ...)
 *  ✅ استعادة كل الميزات المفقودة (7 ميزات كانت محذوفة في النسخة المبسطة):
 *       • شريط إحصائيات الموبايل (showStatsSection)
 *       • قسم الفيديو المخصص (dedicated_section)
 *       • فيديوهات about + footer
 *       • إرسال التقييم إلى Supabase (customer_reviews)
 *       • عارض الصور بملء الشاشة (fullScreenImage)
 *       • الروابط المخصصة في السايدبار (customNavLinks)
 *       • فوتر السايدبار (زر اللغة + زر الدخول)
 *  ✅ إصلاح خلل منطقي في زر "التالي" لتقسيم الصفحات (p - 1 → p + 1)
 *  ════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Users, Package, HeartPulse,
  MapPin, Globe, Menu, X, Home, ExternalLink, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, Phone, Mail, Star, Shield, Award, Zap,
  Check, Send, ZoomIn, ZoomOut, Target, Megaphone,
  Facebook, Twitter, Linkedin, Instagram, Youtube, Sparkles, Eye, FileText,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { reviewService } from '../../services/sdk';
import type {
  LandingVideo, LandingProduct, LandingAgent, LandingStat,
} from '../../shared/types/landing';

interface LandingPageProps {
  onLoginClick: () => void;
  previewMode?: boolean;
  previewDevice?: 'desktop' | 'tablet' | 'mobile';
}

// ─── نوع الأيقونات الموحَّد (LucideIcon متوافق 100% مع مكونات lucide-react) ────
type IconType = LucideIcon;

interface NavLinkItem {
  id: string;
  icon: IconType;
  label: string;
}

// ─── Helpers ─────────────────────────────────────────────────────
const getYoutubeId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const hexToRgb = (hex: string): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
};

// ─── Animated Counter ────────────────────────────────────────────
const AnimatedCounter = ({
  target, suffix = '', duration = 2000,
}: { target: number; suffix?: string; duration?: number }) => {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        setStarted(true);
        let start = 0;
        const step = target / (duration / 16);
        const timer = setInterval(() => {
          start += step;
          if (start >= target) { setCount(target); clearInterval(timer); }
          else { setCount(Math.floor(start)); }
        }, 16);
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration, started]);

  return <span ref={ref}>{count.toLocaleString('ar-SA')}{suffix}</span>;
};

// ─── Scroll Reveal Hook ──────────────────────────────────────────
const useScrollReveal = (threshold = 0.15) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, visible };
};

// ─── Reveal Wrapper ──────────────────────────────────────────────
const Reveal = ({
  children, delay = 0, direction = 'up', className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  className?: string;
}) => {
  const { ref, visible } = useScrollReveal();
  const transforms: Record<string, string> = {
    up: 'translateY(40px)', down: 'translateY(-40px)',
    left: 'translateX(-40px)', right: 'translateX(40px)', none: 'none',
  };
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : transforms[direction],
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────
export default function LandingPage({
  onLoginClick, previewMode = false, previewDevice = 'desktop',
}: LandingPageProps) {
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState('home');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LandingProduct | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<LandingAgent | null>(null);
  const [showDirections, setShowDirections] = useState(false);
  const [userLocation, setUserLocation] = useState('');
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [showProductsPortal, setShowProductsPortal] = useState(false);
  const [portalCategory, setPortalCategory] = useState<string>('');
  const [portalPage, setPortalPage] = useState(1);
  const [reviewForm, setReviewForm] = useState({ name: '', email: '', text: '', rating: 0 });
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);

  const { landingConfig, fetchLandingConfig, isLoadingConfig } = useUIStore();
  const isRTL = lang === 'ar';

  const videos = (landingConfig.videos || []) as LandingVideo[];
  const tc = landingConfig.themeColor || '#4f46e5';
  const tcRgb = hexToRgb(tc);
  const products: LandingProduct[] = (landingConfig.products || []) as LandingProduct[];

  // Responsive classes
  const isDesktop = !previewMode || previewDevice === 'desktop';
  const isTablet = previewMode && previewDevice === 'tablet';
  const isMobile = previewMode && previewDevice === 'mobile';
  const showDesktopNav = isDesktop ? 'hidden xl:flex' : 'hidden';
  const showHamburger = isDesktop ? 'xl:hidden' : 'flex';
  const showSmActions = isMobile ? 'hidden' : (isDesktop ? 'hidden md:flex' : 'flex');
  const gridHero = isDesktop ? 'grid lg:grid-cols-2' : 'grid grid-cols-1';
  const gridAbout = isDesktop ? 'grid lg:grid-cols-12' : 'flex flex-col';
  const colAboutLeft = isDesktop ? 'lg:col-span-7' : 'w-full';
  const colAboutRight = isDesktop ? 'lg:col-span-5' : 'w-full';
  const gridAgents = isDesktop ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : (isTablet ? 'grid grid-cols-4' : 'grid grid-cols-2');
  const gridProducts = isDesktop ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' : (isTablet ? 'grid grid-cols-2' : 'grid grid-cols-1');
  const gridFooter = isDesktop ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5' : (isTablet ? 'grid grid-cols-2' : 'grid grid-cols-1');
  const hideOnMobile = isMobile ? 'hidden' : (isDesktop ? 'hidden lg:block' : 'block');

  // ── Fetch config on mount
  useEffect(() => {
    if (!previewMode) fetchLandingConfig();
  }, [previewMode, fetchLandingConfig]);

  // ── Scroll Handler
  useEffect(() => {
    const getScrollEl = () => (previewMode ? document.getElementById('preview-container') : null);
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const el = getScrollEl();
          const scrollY = el ? el.scrollTop : window.scrollY;
          const totalH = el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
          setScrolled(scrollY > 40);
          setShowScrollTop(scrollY > 500);
          setScrollProgress(totalH > 0 ? (scrollY / totalH) * 100 : 0);
          const sections = ['home', 'about', 'care', 'agents', 'products', 'location'];
          for (const id of sections) {
            const elem = document.getElementById(id);
            if (!elem) continue;
            const rect = elem.getBoundingClientRect();
            const offset = el ? el.getBoundingClientRect().top : 0;
            const top = rect.top - offset;
            if (top <= 120 && rect.bottom - offset >= 120) {
              setActiveSection((prev) => (prev !== id ? id : prev));
              break;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    const el = getScrollEl();
    const target = el || window;
    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => target.removeEventListener('scroll', handleScroll);
  }, [previewMode]);

  // ── Reset pagination when category changes
  useEffect(() => { setPortalPage(1); }, [portalCategory]);

  // ── Reset review form when product modal closes
  useEffect(() => {
    if (!selectedProduct) {
      setReviewForm({ name: '', email: '', text: '', rating: 0 });
      setReviewSubmitted(false);
    }
  }, [selectedProduct]);

  // ── Translations
  const t = {
    navHome: isRTL ? 'الرئيسية' : 'Home',
    navAbout: isRTL ? 'من نحن' : 'About Us',
    navCare: isRTL ? 'رعاية المرضى' : 'Patient Care',
    navMarketing: isRTL ? 'التسويق' : 'Marketing',
    navAgents: isRTL ? 'وكلاؤنا' : 'Our Agents',
    navProducts: isRTL ? 'منتجاتنا' : 'Products',
    navLocation: isRTL ? 'موقعنا' : 'Location',
    langSwitch: isRTL ? 'English (EN)' : 'العربية (AR)',
    loginBtn: isRTL ? 'دخول النظام' : 'Login',
    companyName: isRTL ? landingConfig.logoTextAr : landingConfig.logoTextEn,
    heroTitle: isRTL ? landingConfig.heroTitleAr : landingConfig.heroTitleEn,
    heroDesc: isRTL ? landingConfig.heroDescAr : landingConfig.heroDescEn,
    aboutTitle: isRTL ? 'من نحن' : 'About Us',
    aboutP1: isRTL ? landingConfig.aboutP1Ar : landingConfig.aboutP1En,
    aboutP2: isRTL ? landingConfig.aboutP2Ar : landingConfig.aboutP2En,
    aboutP3: isRTL ? landingConfig.aboutP3Ar : landingConfig.aboutP3En,
    careTitle: isRTL ? 'رعاية المرضى' : 'Patient Care',
    careDesc: isRTL
      ? 'صحة المريض هي أولويتنا القصوى. نوفر برامج دعم صحي متكاملة بالتعاون مع أبرز المؤسسات الطبية.'
      : 'Patient health is our top priority. We provide comprehensive health support programs.',
    agentsTitle: isRTL ? 'شبكة وكلائنا' : 'Agent Network',
    agentsDesc: isRTL ? 'شبكة موزعين معتمدين تمتد لتغطي كافة أنحاء البلاد' : 'Certified distributors network covering the entire country',
    prodTitle: isRTL ? 'منتجاتنا' : 'Our Products',
    prodSubtitle: isRTL ? 'مجموعة متكاملة من حلول الأعمال المتميزة' : 'A comprehensive range of premium business solutions',
    locTitle: isRTL ? 'موقعنا' : 'Location',
    locDesc: isRTL ? landingConfig.addressAr : landingConfig.addressEn,
    footer: isRTL
      ? `جميع الحقوق محفوظة © ${new Date().getFullYear()} ${landingConfig.logoTextAr}`
      : `All rights reserved © ${new Date().getFullYear()} ${landingConfig.logoTextEn}`,
    learnMore: isRTL ? 'اعرف أكثر' : 'Learn More',
    contactUs: isRTL ? 'تواصل معنا' : 'Contact Us',
    discoverMore: isRTL ? 'اكتشف المزيد' : 'Discover More',
    scrollDown: isRTL ? 'للأسفل' : 'Scroll',
    brandTag: isRTL ? 'Kyvzon Platform' : 'Kyvzon',
    allProducts: isRTL ? 'جميع المنتجات' : 'All Products',
    viewDetails: isRTL ? 'عرض التفاصيل' : 'View Details',
    noProducts: isRTL ? 'لا توجد منتجات' : 'No products yet',
    additionalLinks: isRTL ? 'روابط إضافية' : 'Additional Links',
    featuredProducts: isRTL ? 'من منتجاتنا' : 'Featured',
    quickLinks: isRTL ? 'روابط سريعة' : 'Quick Links',
    watchLearn: isRTL ? 'شاهد وتعرف' : 'Watch & Learn',
    yourHealth: isRTL ? 'صحتك تهمنا' : 'Your Health Matters',
    partnersSuccess: isRTL ? 'شركاء النجاح' : 'Partners in Success',
    whatWeOffer: isRTL ? 'ما نقدمه' : 'What We Offer',
    visitUs: isRTL ? 'زورونا' : 'Visit Us',
    getToKnow: isRTL ? 'تعرف علينا' : 'Get to Know Us',
    leadingBadge: isRTL ? 'Kyvzon - منصة رائدة' : 'Leading Kyvzon Company',
    certQuality: isRTL ? 'جودة معتمدة' : 'Certified Quality',
    fastDelivery: isRTL ? 'توزيع سريع' : 'Fast Delivery',
    longExp: isRTL ? 'خبرة طويلة' : 'Long Experience',
    strictStd: isRTL ? 'معايير دولية صارمة' : 'Strict intl. standards',
    wideNet: isRTL ? 'شبكة توزيع واسعة' : 'Wide distribution network',
    decades: isRTL ? 'عقود من الريادة' : 'Decades of leadership',
    trusted: isRTL ? 'موثوق به' : 'Trusted',
    quality: isRTL ? 'جودة عالمية' : 'World Quality',
    innovation: isRTL ? 'ابتكار مستمر' : 'Innovation',
    marketingTitle: isRTL ? landingConfig.marketingTitleAr : landingConfig.marketingTitleEn,
    marketingIntro: isRTL ? landingConfig.marketingIntroAr : landingConfig.marketingIntroEn,
    marketingVisionTitle: isRTL ? landingConfig.marketingVisionTitleAr : landingConfig.marketingVisionTitleEn,
    marketingVisionText: isRTL ? landingConfig.marketingVisionTextAr : landingConfig.marketingVisionTextEn,
    marketingCommitment: isRTL ? landingConfig.marketingCommitmentAr : landingConfig.marketingCommitmentEn,
    careItems: isRTL
      ? ['برامج دعم فني مستمرة', 'تعاون مع شركاء تقنيين', 'تسهيل الوصول للخدمات الرقمية', 'متابعة دورية لاحتياجات العملاء']
      : ['Continuous health support programs', 'Collaboration with specialized medical institutions', 'Facilitating access to vital medicines', 'Periodic follow-up on patient cases'],
  };

  const navLinks: NavLinkItem[] = [
    { id: 'home', icon: Home, label: t.navHome },
    { id: 'about', icon: Building2, label: t.navAbout },
    ...(landingConfig.showCareSection ? [{ id: 'care', icon: HeartPulse, label: t.navCare }] : []),
    ...(landingConfig.showMarketingSection ? [{ id: 'marketing', icon: Target, label: t.navMarketing }] : []),
    ...(landingConfig.showAgentsSection ? [{ id: 'agents', icon: Users, label: t.navAgents }] : []),
    { id: 'products', icon: Package, label: t.navProducts },
    { id: 'location', icon: MapPin, label: t.navLocation },
  ];

  const scrollTo = useCallback((id: string) => {
    if (id === 'products') {
      setShowProductsPortal(true);
      setIsSidebarOpen(false);
      window.scrollTo(0, 0);
      return;
    }
    const el = document.getElementById(id);
    const previewContainer = document.getElementById('preview-container');
    if (!el) return;
    const offset = 80;
    if (previewContainer) {
      previewContainer.scrollTo({ top: el.offsetTop - offset, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - offset, behavior: 'smooth' });
    }
    setIsSidebarOpen(false);
  }, []);

  const scrollTopFn = useCallback(() => {
    const pc = document.getElementById('preview-container');
    if (pc) pc.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleGetDirections = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsLoadingLocation(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation(`${position.coords.latitude},${position.coords.longitude}`);
          setShowDirections(true);
          setIsLoadingLocation(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          alert(isRTL ? 'عذراً! لعرض المسار يجب الموافقة على إعطاء صلاحية الموقع (Location) من إعدادات المتصفح.' : 'Please allow location access to show directions.');
          setShowDirections(false);
          setIsLoadingLocation(false);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else {
      alert(isRTL ? 'عذراً! متصفحك لا يدعم ميزة تحديد المواقع.' : 'Geolocation is not supported by your browser.');
      setIsLoadingLocation(false);
    }
  };

  // ── Logo
  const Logo = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
    const cls = { sm: 'w-9 h-9 text-base', md: 'w-11 h-11 text-xl', lg: 'w-20 h-20 text-4xl' }[size];
    if (landingConfig.logoUrl) {
      return <img src={landingConfig.logoUrl} alt="Logo" className={`${cls} object-contain rounded-xl`} />;
    }
    return (
      <div
        className={`${cls} rounded-xl flex items-center justify-center text-white font-black shrink-0`}
        style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 4px 20px rgba(${tcRgb}, 0.4)` }}
      >
        {landingConfig.logoSymbol || '◆'}
      </div>
    );
  };

  // ── Video Renderer
  const renderVideo = (
    video: LandingVideo,
    className = 'w-full aspect-video rounded-3xl overflow-hidden shadow-2xl',
  ) => {
    const videoId = getYoutubeId(video.url);
    if (!videoId) return null;
    let src = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&color=white`;
    if (video.autoplay) src += `&autoplay=1&mute=1&loop=1&playlist=${videoId}`;
    return (
      <div key={video.id} className={className}>
        <iframe
          src={src}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={video.title || 'Video'}
        />
      </div>
    );
  };

  // ── Product Categories
  const predefinedCategories = ['حبوب', 'مراهم وكريمات', 'شرابات', 'مساحيق'];
  const categories = Array.from(
    new Set([...predefinedCategories, ...products.map((p) => p.category).filter(Boolean) as string[]]),
  );
  const portalProducts = portalCategory ? products.filter((p) => p.category === portalCategory) : [];
  const ITEMS_PER_PAGE = 8;
  const totalPages = Math.ceil(portalProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = portalProducts.slice((portalPage - 1) * ITEMS_PER_PAGE, portalPage * ITEMS_PER_PAGE);

  // ── Loading State
  if (isLoadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 animate-pulse" style={{ backgroundColor: tc }} />
          <p className="text-white font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col min-h-screen bg-white ${isRTL ? 'font-["Cairo"]' : 'font-sans'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ══ Global Styles ══ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap');
        *,*::before, *::after { box-sizing: border-box; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes floatY { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
        @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ripple { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes blob { 0%, 100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; } 50% { border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%; } }
        .anim-fade-up   { animation: fadeUp 0.8s cubic-bezier(0.16,1,0.3,1) both; }
        .anim-fade-up-1 { animation: fadeUp 0.8s 0.1s cubic-bezier(0.16,1,0.3,1) both; }
        .anim-fade-up-2 { animation: fadeUp 0.8s 0.25s cubic-bezier(0.16,1,0.3,1) both; }
        .anim-fade-up-3 { animation: fadeUp 0.8s 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .anim-fade-up-4 { animation: fadeUp 0.8s 0.55s cubic-bezier(0.16,1,0.3,1) both; }
        .anim-fade-up-5 { animation: fadeUp 0.8s 0.7s cubic-bezier(0.16,1,0.3,1) both; }
        .anim-float     { animation: floatY 5s ease-in-out infinite; }
        .anim-spin-slow { animation: spinSlow 20s linear infinite; }
        .anim-blob      { animation: blob 8s ease-in-out infinite; }
        .hero-bg { background: linear-gradient(135deg, rgba(${tcRgb}, 1) 0%, rgba(${tcRgb}, 0.85) 50%, rgba(${tcRgb}, 0.7) 100%); }
        .hero-overlay { background: linear-gradient(160deg, rgba(2,6,23,0.72) 0%, rgba(2,6,23,0.40) 60%, rgba(${tcRgb},0.15) 100%); }
        .noise-bg { background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E"); }
        .grid-bg { background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 80px 80px; }
        .glass { background: rgba(255,255,255,0.08); backdrop-filter: blur(8px) saturate(180%); -webkit-backdrop-filter: blur(8px) saturate(180%); border: 1px solid rgba(255,255,255,0.15); }
        .glass-white { background: rgba(255,255,255,0.92); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.6); }
        .card-hover { transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.4s ease; }
        .card-hover:hover { transform: translateY(-8px) scale(1.01); box-shadow: 0 24px 64px rgba(${tcRgb},0.18), 0 8px 24px rgba(0,0,0,0.08); }
        .btn-primary { background: linear-gradient(135deg, ${tc}, ${tc}cc); box-shadow: 0 4px 20px rgba(${tcRgb},0.4); transition: all 0.3s ease; }
        .btn-primary:hover { filter: brightness(1.1); transform: translateY(-2px); box-shadow: 0 8px 32px rgba(${tcRgb},0.5); }
        .btn-primary:active { transform: translateY(0); }
        .btn-outline { border: 2px solid rgba(255,255,255,0.3); background: transparent; transition: all 0.3s ease; }
        .btn-outline:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.5); }
        .title-line { position: relative; display: inline-block; }
        .title-line::after { content: ''; position: absolute; bottom: -8px; left: 0; right: 0; height: 4px; border-radius: 99px; background: linear-gradient(90deg, ${tc}, ${tc}44); }
        .title-line.center::after { left: 50%; right: auto; transform: translateX(-50%); width: 60px; }
        .nav-link-active { background: rgba(${tcRgb},0.12); color: ${tc} !important; }
        .nav-link { position: relative; transition: all 0.25s ease; }
        .nav-link::after { content: ''; position: absolute; bottom: -2px; left: 50%; right: 50%; height: 2px; border-radius: 99px; background: ${tc}; transition: all 0.3s ease; }
        .nav-link:hover::after, .nav-link-active::after { left: 10%; right: 10%; }
        .sidebar-item { transition: all 0.25s ease; border-radius: 14px; }
        .sidebar-item:hover { background: rgba(${tcRgb},0.08); }
        .sidebar-item-active { background: rgba(${tcRgb},0.12); color: ${tc}; }
        .scroll-progress { background: linear-gradient(90deg, ${tc}, ${tc}88); box-shadow: 0 0 8px rgba(${tcRgb},0.5); }
        .stat-card { background: rgba(255,255,255,0.06); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.12); transition: all 0.3s ease; }
        .stat-card:hover { background: rgba(255,255,255,0.12); transform: translateY(-4px); }
        .ripple-ring { position: absolute; border-radius: 50%; border: 2px solid ${tc}; animation: ripple 2.5s ease-out infinite; }
        .gradient-text { background: linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .footer-link { transition: all 0.25s ease; position: relative; }
        .footer-link:hover { color: white; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(${tcRgb},0.5); border-radius: 99px; }
        ::-webkit-scrollbar-thumb:hover { background: ${tc}; }
        .hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {!showProductsPortal && (
        <>
          {/* SCROLL PROGRESS BAR */}
          <div
            className="fixed top-0 left-0 z-[60] h-[3px] scroll-progress transition-all duration-150"
            style={{ width: `${scrollProgress}%` }}
          />

          {/* HEADER */}
          <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'glass-white shadow-[0_4px_32px_rgba(0,0,0,0.08)]' : 'bg-transparent'}`}
            style={{ height: scrolled ? '68px' : '84px' }}
          >
            <div className="max-w-screen-2xl mx-auto h-full flex items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-16">
              {/* Logo */}
              <button onClick={() => scrollTo('home')} className="flex items-center gap-3 group" aria-label="Go to home">
                <div className="transition-transform duration-300 group-hover:scale-105"><Logo size="md" /></div>
                <div className={isRTL ? 'text-right' : 'text-left'}>
                  <h1 className={`font-black leading-tight transition-all duration-300 ${scrolled ? 'text-slate-900 text-base' : 'text-white text-lg'}`}>{t.companyName}</h1>
                  <p className="text-xs font-bold transition-all duration-300" style={{ color: scrolled ? tc : 'rgba(255,255,255,0.75)' }}>{t.brandTag}</p>
                </div>
              </button>

              {/* Desktop Nav */}
              <nav className={`${showDesktopNav} items-center gap-1`}>
                {navLinks.map((link) => (
                  <button
                    key={link.id}
                    onClick={() => scrollTo(link.id)}
                    className={`nav-link px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 ${
                      activeSection === link.id
                        ? (scrolled ? 'nav-link-active text-slate-900' : 'text-white bg-white/15')
                        : (scrolled ? 'text-slate-500 hover:text-slate-900' : 'text-white/75 hover:text-white')
                    }`}
                  >
                    {link.label}
                  </button>
                ))}
              </nav>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
                  className={`${showSmActions} items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold transition-all ${scrolled ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900' : 'text-white/75 hover:bg-white/12 hover:text-white'}`}
                >
                  <Globe size={14} /> {t.langSwitch}
                </button>
                <button
                  onClick={onLoginClick}
                  className={`${showSmActions} items-center gap-2 px-5 py-2.5 text-white font-bold rounded-xl text-sm btn-primary`}
                >
                  {t.loginBtn} {isRTL ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                </button>
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className={`p-2.5 rounded-xl transition-all ${showHamburger} ${scrolled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-white/12 text-white hover:bg-white/20'}`}
                  aria-label="Open menu"
                >
                  <Menu size={22} />
                </button>
              </div>
            </div>
          </header>

          {/* SIDEBAR DRAWER */}
          <div
            className={`fixed inset-0 z-[55] bg-black/60 backdrop-blur-sm transition-all duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside
            className={`fixed top-0 bottom-0 z-[56] w-[300px] sm:w-80 bg-white shadow-2xl flex flex-col transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isRTL ? 'right-0' : 'left-0'} ${isSidebarOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full' : '-translate-x-full')}`}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {/* Sidebar Header */}
            <div
              className="px-6 py-5 flex items-center justify-between border-b border-slate-100"
              style={{ background: `linear-gradient(135deg, rgba(${tcRgb},0.06), rgba(${tcRgb},0.02))` }}
            >
              <div className="flex items-center gap-3">
                <Logo size="md" />
                <div>
                  <h2 className="font-black text-slate-900 text-base">{t.companyName}</h2>
                  <p className="text-xs font-semibold" style={{ color: tc }}>{t.brandTag}</p>
                </div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                <X size={20} />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto hide-scrollbar">
              {navLinks.map((link) => {
                const LinkIcon = link.icon;
                return (
                  <button
                    key={link.id}
                    onClick={() => scrollTo(link.id)}
                    className={`sidebar-item w-full flex items-center gap-3 px-4 py-3.5 font-bold text-sm transition-all ${activeSection === link.id ? 'sidebar-item-active' : 'text-slate-600'}`}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform" style={{ background: `rgba(${tcRgb},0.1)` }}>
                      <LinkIcon size={17} style={{ color: tc }} />
                    </div>
                    <span className="flex-1 text-start">{link.label}</span>
                    {activeSection === link.id && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tc }} />}
                  </button>
                );
              })}

              {/* Custom Links */}
              {(landingConfig.customNavLinks || []).length > 0 && (
                <div className="pt-4 mt-3 border-t border-slate-100">
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-4 mb-3">{t.additionalLinks}</p>
                  {(landingConfig.customNavLinks || []).map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="sidebar-item flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-500 transition-all"
                    >
                      <ExternalLink size={15} style={{ color: tc }} />
                      {isRTL ? link.labelAr : link.labelEn}
                    </a>
                  ))}
                </div>
              )}
            </nav>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-slate-100 space-y-2.5" style={{ background: 'rgba(248,250,252,1)' }}>
              <button
                onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-sm rounded-xl transition-all hover:bg-slate-50"
              >
                <Globe size={17} style={{ color: tc }} /> {t.langSwitch}
              </button>
              <button
                onClick={onLoginClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white font-black rounded-xl text-sm btn-primary"
              >
                {t.loginBtn} {isRTL ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
              </button>
            </div>
          </aside>

          {/* MAIN CONTENT */}
          <main className="flex-1">
            {/* HERO */}
            <section id="home" className="relative min-h-screen flex items-center overflow-hidden hero-bg" style={{ paddingTop: '84px' }}>
              <div className="absolute inset-0 hero-overlay" />
              <div className="absolute inset-0 grid-bg opacity-100" />
              <div className="absolute inset-0 noise-bg" />
              <div className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full opacity-20 blur-[100px] anim-blob hidden md:block" style={{ backgroundColor: tc }} />
              <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full opacity-15 blur-[80px] hidden md:block" style={{ backgroundColor: tc, animationDelay: '4s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full border border-white/5 anim-spin-slow pointer-events-none hidden md:block" />

              <div className="relative z-10 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 py-16 w-full">
                <div className={`${gridHero} gap-12 xl:gap-20 items-center`}>
                  {/* Left: Text */}
                  <div className={isRTL ? 'text-right' : 'text-left'}>
                    <div className="anim-fade-up inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-white/90 text-xs sm:text-sm font-bold mb-6 sm:mb-8">
                      <Sparkles size={13} className="text-yellow-300" /> {t.leadingBadge} <Star size={13} className="fill-yellow-300 text-yellow-300" />
                    </div>
                    <h2 className="anim-fade-up-1 text-3xl sm:text-4xl md:text-5xl xl:text-6xl 2xl:text-7xl font-black text-white leading-[1.15] mb-5 sm:mb-7">{t.heroTitle}</h2>
                    <p className="anim-fade-up-2 text-base sm:text-lg text-white/75 leading-relaxed mb-8 sm:mb-10 max-w-xl">{t.heroDesc}</p>

                    <div className="anim-fade-up-3 flex flex-wrap gap-2 sm:gap-3 mb-8 sm:mb-10">
                      {[{ icon: Shield, label: t.trusted }, { icon: Award, label: t.quality }, { icon: Zap, label: t.innovation }].map((f, i) => {
                        const FIcon = f.icon;
                        return (
                          <div key={i} className="flex items-center gap-2 px-3 sm:px-4 py-2 glass rounded-full text-white text-xs sm:text-sm font-bold">
                            <FIcon size={13} className="text-yellow-300" /> {f.label}
                          </div>
                        );
                      })}
                    </div>

                    <div className="anim-fade-up-4 flex flex-wrap gap-3 sm:gap-4">
                      <button onClick={() => scrollTo('products')} className="px-6 sm:px-8 py-3.5 sm:py-4 bg-white font-black rounded-2xl shadow-2xl hover:-translate-y-1 hover:shadow-white/20 transition-all text-sm sm:text-base" style={{ color: tc }}>{t.navProducts}</button>
                      <button onClick={() => scrollTo('about')} className="px-6 sm:px-8 py-3.5 sm:py-4 btn-outline glass text-white font-black rounded-2xl text-sm sm:text-base">{t.learnMore}</button>
                    </div>

                    {(landingConfig.phone || landingConfig.email) && (
                      <div className="anim-fade-up-5 flex flex-wrap gap-4 mt-8 pt-8 border-t border-white/15">
                        {landingConfig.phone && (
                          <a href={`tel:${landingConfig.phone}`} className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-semibold transition-colors">
                            <Phone size={14} /> {landingConfig.phone}
                          </a>
                        )}
                        {landingConfig.email && (
                          <a href={`mailto:${landingConfig.email}`} className="flex items-center gap-2 text-white/70 hover:text-white text-sm font-semibold transition-colors">
                            <Mail size={14} /> {landingConfig.email}
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: Stats / Video */}
                  <div className={`${hideOnMobile} anim-float`}>
                    {videos.filter((v) => v.placement === 'hero').length > 0 ? (
                      <div className="rounded-3xl overflow-hidden shadow-2xl border border-white/15">
                        {videos.filter((v) => v.placement === 'hero').map((video) => renderVideo(video, 'w-full aspect-video'))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {((landingConfig.stats && landingConfig.stats.length > 0 ? landingConfig.stats : [
                          { id: 's1', value: 20, suffix: '+', labelAr: 'سنة خبرة', labelEn: 'Years Experience' },
                          { id: 's2', value: 500, suffix: '+', labelAr: 'منتج دوائي', labelEn: 'Products' },
                          { id: 's3', value: 1000, suffix: '+', labelAr: 'عميل موثوق', labelEn: 'Trusted Clients' },
                          { id: 's4', value: 50, suffix: '+', labelAr: 'وكيل معتمد', labelEn: 'Certified Agents' },
                        ]) as LandingStat[]).map((stat) => (
                          <div key={stat.id} className="stat-card rounded-2xl p-6 xl:p-8 text-center">
                            <div className="text-3xl xl:text-4xl 2xl:text-5xl font-black text-white mb-2"><AnimatedCounter target={stat.value} suffix={stat.suffix} /></div>
                            <div className="text-white/60 text-sm font-semibold">{isRTL ? stat.labelAr : stat.labelEn}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scroll Indicator */}
                <div className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/40">
                  <span className="text-[10px] font-bold uppercase tracking-widest">{t.scrollDown}</span>
                  <ChevronDown size={18} className="animate-bounce" />
                </div>
              </div>
            </section>

            {/* STATS BAR (Mobile) */}
            {landingConfig.showStatsSection && (
              <section className={`${isDesktop ? 'lg:hidden' : (isMobile ? 'block' : 'hidden')} py-10 px-4`} style={{ background: `linear-gradient(135deg, ${tc}f5, ${tc}e8)` }}>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
                  {((landingConfig.stats || []) as LandingStat[]).map((stat) => (
                    <div key={stat.id} className="text-center">
                      <div className="text-2xl sm:text-3xl font-black mb-1" style={{ color: tc }}>
                        <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                      </div>
                      <div className="text-xs font-bold text-slate-600">{isRTL ? stat.labelAr : stat.labelEn}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ABOUT */}
            <section id="about" className="py-20 sm:py-28 bg-white overflow-hidden">
              <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16">
                <Reveal className="text-center mb-14 sm:mb-20">
                  <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] mb-3" style={{ color: tc }}>{t.getToKnow}</p>
                  <h3 className="text-3xl sm:text-4xl xl:text-5xl font-black text-slate-900"><span className="title-line center">{t.aboutTitle}</span></h3>
                </Reveal>

                <div className={`${gridAbout} gap-10 xl:gap-16 items-start`}>
                  <div className={`${colAboutLeft} space-y-8`}>
                    <Reveal direction="left" className="space-y-5 text-slate-600 text-base sm:text-lg leading-relaxed">
                      {t.aboutP1 && <p>{t.aboutP1}</p>}
                      {t.aboutP2 && <p>{t.aboutP2}</p>}
                      {t.aboutP3 && <p>{t.aboutP3}</p>}
                    </Reveal>

                    <Reveal delay={0.15}>
                      <div className="grid sm:grid-cols-3 gap-4 pt-2">
                        {[{ icon: Shield, title: t.certQuality, desc: t.strictStd }, { icon: Zap, title: t.fastDelivery, desc: t.wideNet }, { icon: Award, title: t.longExp, desc: t.decades }].map((f, i) => {
                          const FIcon = f.icon;
                          return (
                            <div key={i} className="p-5 xl:p-6 rounded-2xl border border-slate-100 hover:border-transparent card-hover group cursor-default" style={{ background: `linear-gradient(135deg, rgba(${tcRgb},0.05), rgba(${tcRgb},0.02))` }}>
                              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ background: `rgba(${tcRgb},0.12)` }}><FIcon size={20} style={{ color: tc }} /></div>
                              <h5 className="font-black text-slate-800 text-sm mb-1">{f.title}</h5>
                              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
                            </div>
                          );
                        })}
                      </div>
                    </Reveal>

                    {/* About Videos */}
                    {videos.filter((v) => v.placement === 'about').length > 0 && (
                      <Reveal delay={0.2}>
                        <div className="space-y-4">
                          {videos.filter((v) => v.placement === 'about').map((video) => renderVideo(video, 'w-full aspect-video rounded-2xl overflow-hidden shadow-lg border border-slate-100'))}
                        </div>
                      </Reveal>
                    )}
                  </div>

                  {/* Sidebar Card */}
                  <Reveal delay={0.1} direction="right" className={colAboutRight}>
                    <div className="rounded-3xl p-7 xl:p-9 shadow-xl sticky top-24 border border-slate-100 overflow-hidden relative" style={{ background: `linear-gradient(135deg, rgba(${tcRgb},0.07), rgba(${tcRgb},0.02))` }}>
                      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-10 blur-2xl hidden md:block" style={{ backgroundColor: tc }} />
                      <div className="relative">
                        <div className="flex items-center gap-3 mb-6"><Logo size="sm" /><h4 className="font-black text-slate-800 text-base">{t.companyName}</h4></div>
                        <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-4" style={{ color: tc }}>{t.featuredProducts}</p>
                        <ul className="space-y-2.5">
                          {products.slice(0, 7).map((prod) => (
                            <li key={prod.id} className="flex items-center gap-3 group">
                              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: `rgba(${tcRgb},0.15)` }}><Check size={11} style={{ color: tc }} /></div>
                              <span className="font-bold text-slate-700 text-sm">{isRTL ? prod.titleAr : prod.titleEn}</span>
                            </li>
                          ))}
                        </ul>
                        <button onClick={() => scrollTo('products')} className="w-full mt-7 py-3.5 text-white font-black rounded-xl text-sm btn-primary flex items-center justify-center gap-2">{t.navProducts} {isRTL ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}</button>
                      </div>
                    </div>
                  </Reveal>
                </div>
              </div>
            </section>

            {/* DEDICATED VIDEO SECTION */}
            {videos.filter((v) => v.placement === 'dedicated_section').length > 0 && (
              <section className="py-20 sm:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #020617 0%, #0f172a 100%)' }}>
                <div className="absolute inset-0 opacity-25" style={{ backgroundImage: `radial-gradient(ellipse at 30% 50%, rgba(${tcRgb},0.5) 0%, transparent 65%)` }} />
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 relative z-10">
                  <Reveal className="text-center mb-12">
                    <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] mb-3" style={{ color: tc }}>{t.watchLearn}</p>
                    <h3 className="text-3xl sm:text-4xl font-black text-white">{t.discoverMore}</h3>
                  </Reveal>
                  <div className="space-y-8">
                    {videos.filter((v) => v.placement === 'dedicated_section').map((video) => renderVideo(video, 'w-full aspect-video rounded-3xl overflow-hidden shadow-2xl border border-white/10'))}
                  </div>
                </div>
              </section>
            )}

            {/* PATIENT CARE */}
            {landingConfig.showCareSection && (
              <section id="care" className="py-20 sm:py-28 bg-white overflow-hidden">
                <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
                  <div className={`${gridHero} gap-12 xl:gap-20 items-center`}>
                    {/* Visual */}
                    <Reveal direction="left" className="order-last lg:order-first">
                      <div className="relative w-full h-72 sm:h-96 rounded-3xl overflow-hidden flex items-center justify-center" style={{ background: `linear-gradient(135deg, rgba(${tcRgb},0.12), rgba(${tcRgb},0.04))` }}>
                        {[180, 260, 340].map((size, i) => (
                          <div key={i} className="ripple-ring" style={{ width: size, height: size, opacity: 0.15, animationDelay: `${i * 0.8}s`, animationDuration: '3s' }} />
                        ))}
                        <div className="relative z-10 w-28 h-28 sm:w-36 sm:h-36 rounded-3xl flex items-center justify-center shadow-2xl" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 16px 64px rgba(${tcRgb},0.5)` }}>
                          <HeartPulse size={56} className="text-white" strokeWidth={1.5} />
                        </div>
                        {[{ label: isRTL ? 'رعاية ٢٤/٧' : '24/7 Care', pos: 'top-6 left-6' }, { label: isRTL ? 'دعم متخصص' : 'Expert Support', pos: 'bottom-6 right-6' }].map((b, i) => (
                          <div key={i} className={`absolute ${b.pos} glass rounded-xl px-3 py-2 text-xs font-black text-white`} style={{ background: `rgba(${tcRgb},0.7)`, backdropFilter: 'blur(8px)' }}>
                            {b.label}
                          </div>
                        ))}
                      </div>
                    </Reveal>

                    {/* Content */}
                    <Reveal direction="right">
                      <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] mb-3" style={{ color: tc }}>{t.yourHealth}</p>
                      <h3 className="text-3xl sm:text-4xl font-black text-slate-900 mb-6"><span className="title-line">{t.careTitle}</span></h3>
                      <p className="text-base sm:text-lg text-slate-600 leading-relaxed mb-8">{t.careDesc}</p>
                      <div className="space-y-3">
                        {t.careItems.map((item, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: `rgba(${tcRgb},0.12)` }}><Check size={12} style={{ color: tc }} /></div>
                            <span className="font-semibold text-slate-700 text-sm sm:text-base">{item}</span>
                          </div>
                        ))}
                      </div>
                    </Reveal>
                  </div>
                </div>
              </section>
            )}

            {/* AGENTS */}
            {landingConfig.showAgentsSection && (
              <section id="agents" className="py-20 sm:py-28 bg-slate-50/80 border-y border-slate-100">
                <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
                  <Reveal className="text-center mb-14">
                    <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] mb-3" style={{ color: tc }}>{t.partnersSuccess}</p>
                    <h3 className="text-3xl sm:text-4xl font-black text-slate-900"><span className="title-line center">{t.agentsTitle}</span></h3>
                    <p className="text-slate-500 mt-6 max-w-lg mx-auto text-sm sm:text-base">{t.agentsDesc}</p>
                  </Reveal>
                  <div className={`${gridAgents} gap-4 sm:gap-6`}>
                    {(landingConfig.agents && landingConfig.agents.length > 0 ? landingConfig.agents : Array.from({ length: 8 }) as LandingAgent[]).map((agent, i) => (
                      <Reveal key={agent?.id || i} delay={i * 0.05}>
                        <div
                          className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-5 flex items-center justify-center h-32 sm:h-40 card-hover group cursor-pointer relative overflow-hidden"
                          onClick={() => agent?.name && setSelectedAgent(agent)}
                        >
                          {agent?.logoUrl ? (
                            <img src={agent.logoUrl} alt={agent.name || 'وكيل'} className="w-[85%] h-[85%] sm:w-full sm:h-full object-contain transition-all duration-300 group-hover:scale-110" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `rgba(${tcRgb},0.08)` }}>
                              <Building2 size={22} style={{ color: tc }} className="opacity-60 group-hover:scale-110 transition-transform" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-white font-bold text-sm flex items-center gap-2"><Eye size={16} /> {isRTL ? 'عرض التفاصيل' : 'View Details'}</span>
                          </div>
                        </div>
                      </Reveal>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* PRODUCTS */}
            <section id="products" className="py-24 sm:py-32 bg-white overflow-hidden relative">
              <div className="absolute inset-0 bg-slate-50/50" style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
              <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16">
                <Reveal className="text-center relative z-10">
                  <div className="w-20 h-20 mx-auto rounded-3xl mb-6 flex items-center justify-center shadow-lg" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)` }}>
                    <Package size={36} className="text-white" />
                  </div>
                  <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] mb-3" style={{ color: tc }}>{t.whatWeOffer}</p>
                  <h3 className="text-3xl sm:text-4xl xl:text-5xl font-black text-slate-900 mb-6"><span className="title-line center">{t.prodTitle}</span></h3>
                  <p className="text-slate-500 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed mb-10">
                    {isRTL
                      ? 'اكتشف مجموعتنا المتكاملة من المنتجات الدوائية المصنعة بأعلى معايير الجودة العالمية. تصفح منتجاتنا حسب الأصناف الدوائية (حبوب، مراهم، شرابات، مساحيق) من خلال لوحة المنتجات المخصصة.'
                      : 'Discover our comprehensive range of services and solutions delivered to the highest global standards.'}
                  </p>
                  <button
                    onClick={() => { setShowProductsPortal(true); window.scrollTo(0, 0); }}
                    className="px-8 py-4 text-white font-black rounded-2xl text-lg shadow-2xl hover:-translate-y-1 transition-all mx-auto flex items-center gap-3"
                    style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 8px 30px rgba(${tcRgb},0.3)` }}
                  >
                    {isRTL ? 'الدخول للوحة المنتجات' : 'Enter Products Portal'}
                    {isRTL ? <ArrowLeft size={20} /> : <ArrowRight size={20} />}
                  </button>
                </Reveal>
              </div>
            </section>

            {/* LOCATION */}
            {landingConfig.showLocationSection !== false && (
              <section id="location" className="py-20 sm:py-28 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #020617 0%, #0f172a 100%)' }}>
                <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(ellipse at 70% 50%, rgba(${tcRgb},0.3) 0%, transparent 60%)` }} />
                <div className="absolute inset-0 grid-bg opacity-50" />
                <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10">
                  <Reveal className="text-center mb-12">
                    <p className="text-xs sm:text-sm font-black uppercase tracking-[0.2em] mb-3" style={{ color: tc }}>{t.visitUs}</p>
                    <h3 className="text-3xl sm:text-4xl font-black text-white">{t.locTitle}</h3>
                  </Reveal>
                  <Reveal delay={0.1}>
                    <div className="max-w-lg mx-auto">
                      {/* Contact Card */}
                      <div className="rounded-3xl p-8 sm:p-12 border relative overflow-hidden h-full flex flex-col justify-center mb-6" style={{ background: 'rgba(255,255,255,0.04)', borderColor: `rgba(${tcRgb},0.3)`, backdropFilter: 'blur(12px)' }}>
                        <div className="absolute inset-0 opacity-10 blur-3xl hidden md:block" style={{ background: tc }} />
                        <div className="relative text-center">
                          <div className="w-16 sm:w-20 h-16 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-6" style={{ background: `rgba(${tcRgb},0.2)`, boxShadow: `0 0 40px rgba(${tcRgb},0.3)` }}>
                            <MapPin size={36} style={{ color: tc }} />
                          </div>
                          <p className="text-lg sm:text-xl text-white font-bold leading-relaxed mb-6">{t.locDesc}</p>
                          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6 border-t border-white/10">
                            {landingConfig.phone && (
                              <a href={`tel:${landingConfig.phone}`} className="flex items-center gap-2 text-white/60 hover:text-white text-sm font-semibold transition-colors">
                                <Phone size={14} style={{ color: tc }} /> {landingConfig.phone}
                              </a>
                            )}
                            {landingConfig.email && (
                              <a href={`mailto:${landingConfig.email}`} className="flex items-center gap-2 text-white/60 hover:text-white text-sm font-semibold transition-colors">
                                <Mail size={14} style={{ color: tc }} /> {landingConfig.email}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Map Card */}
                      <div className="rounded-3xl overflow-hidden border h-[300px] sm:h-[400px] relative w-full shadow-2xl group bg-white" style={{ borderColor: `rgba(${tcRgb},0.3)` }}>
                        <iframe
                          title="Location Map"
                          width="100%"
                          height="100%"
                          frameBorder="0"
                          style={{ border: 0 }}
                          referrerPolicy="no-referrer-when-downgrade"
                          loading="lazy"
                          src={(() => {
                            const url = (landingConfig.mapUrl || '').trim();
                            let finalUrl = '';
                            if (showDirections && userLocation) {
                              let destQuery = encodeURIComponent(landingConfig.addressAr || landingConfig.addressEn || 'Company');
                              if (url && url.includes('!3d') && url.includes('!2d')) {
                                const matchLat = url.match(/!3d(-?\d+\.\d+)/);
                                const matchLng = url.match(/!2d(-?\d+\.\d+)/);
                                if (matchLat && matchLng) destQuery = `${matchLat[1]},${matchLng[1]}`;
                              } else if (url && !url.includes('<iframe') && !url.includes('embed')) {
                                destQuery = encodeURIComponent(url);
                              }
                              return `https://maps.google.com/maps?saddr=${userLocation}&daddr=${destQuery}&output=embed&t=k`;
                            }
                            if (url && url.includes('<iframe')) {
                              const match = url.match(/src="([^"]+)"/);
                              finalUrl = match ? match[1] : '';
                            } else if (url && url.includes('output=embed')) {
                              finalUrl = url;
                            }
                            if (!finalUrl) {
                              const fallbackQuery = url || landingConfig.addressAr || landingConfig.addressEn || 'Kyvzon+Baghdad+Iraq';
                              finalUrl = `https://maps.google.com/maps?q=${encodeURIComponent(fallbackQuery)}&output=embed&t=k`;
                            }
                            return finalUrl;
                          })()}
                          allowFullScreen
                          className="relative z-10 transition-transform duration-700 group-hover:scale-[1.02]"
                        />

                        {/* Get Directions Button */}
                        {!showDirections && (
                          <button
                            onClick={handleGetDirections}
                            disabled={isLoadingLocation}
                            className="absolute bottom-5 left-5 z-30 flex items-center gap-2 bg-white text-slate-900 px-5 py-3 rounded-2xl font-bold text-sm shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:bg-slate-50 transition-all hover:scale-105 hover:-translate-y-1 disabled:opacity-70 disabled:hover:scale-100 disabled:hover:translate-y-0"
                          >
                            {isLoadingLocation ? (
                              <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
                            ) : (
                              <MapPin size={18} style={{ color: tc }} className="animate-bounce" />
                            )}
                            {isLoadingLocation ? (isRTL ? 'جاري التحديد...' : 'Locating...') : (isRTL ? 'طريق الوصول' : 'Get Directions')}
                          </button>
                        )}
                        {showDirections && (
                          <button
                            onClick={() => setShowDirections(false)}
                            className="absolute bottom-5 left-5 z-30 flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-bold text-sm shadow-[0_8px_30px_rgba(0,0,0,0.3)] hover:bg-slate-800 transition-all hover:scale-105 hover:-translate-y-1"
                          >
                            <X size={18} className="text-white" /> {isRTL ? 'إلغاء المسار' : 'Close Route'}
                          </button>
                        )}
                        <div className="absolute inset-0 pointer-events-none rounded-3xl border border-white/10 shadow-[inset_0_0_30px_rgba(0,0,0,0.4)] z-20" />
                      </div>
                    </div>
                  </Reveal>
                </div>
              </section>
            )}

            {/* MARKETING & VISION */}
            {landingConfig.showMarketingSection && (
              <section id="marketing" className="py-20 sm:py-28 bg-slate-50/50 border-t border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-pink-50 rounded-full blur-3xl opacity-50 translate-y-1/3 -translate-x-1/3 pointer-events-none" />
                <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 relative z-10">
                  <div className={`${gridHero} gap-12 xl:gap-20 items-center`}>
                    <Reveal direction="left">
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass bg-white/50 text-indigo-700 text-xs sm:text-sm font-bold mb-6 shadow-sm border border-indigo-100">
                        <Megaphone size={16} className="text-indigo-500" /> {t.navMarketing}
                      </div>
                      <h3 className="text-3xl sm:text-4xl font-black text-slate-900 mb-6 leading-tight">
                        {t.marketingTitle || (isRTL ? 'التسويق والمبيعات' : 'Marketing & Sales')}
                      </h3>
                      <p className="text-base sm:text-lg text-slate-600 leading-relaxed font-medium">{t.marketingIntro}</p>
                    </Reveal>
                    <Reveal direction="right" delay={0.2} className="space-y-6">
                      <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-amber-400 to-orange-500" />
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform shadow-sm"><Target size={24} /></div>
                          <h4 className="text-2xl font-black text-slate-800">{t.marketingVisionTitle}</h4>
                        </div>
                        <p className="text-slate-600 leading-relaxed sm:text-lg font-medium">{t.marketingVisionText}</p>
                      </div>
                      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 sm:p-10 shadow-lg text-white relative overflow-hidden">
                        <Sparkles size={120} className="absolute -bottom-4 -left-4 text-white/5 rotate-12" />
                        <p className="text-lg sm:text-xl font-bold leading-relaxed relative z-10">&ldquo;{t.marketingCommitment}&rdquo;</p>
                      </div>
                    </Reveal>
                  </div>
                </div>
              </section>
            )}

            {/* FOOTER */}
            <footer className="bg-slate-950 border-t border-slate-800 pt-14 sm:pt-20 pb-8 px-4 sm:px-6">
              <div className="max-w-screen-2xl mx-auto">
                {/* Footer Videos */}
                {videos.filter((v) => v.placement === 'footer').length > 0 && (
                  <div className="mb-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {videos.filter((v) => v.placement === 'footer').map((video) => renderVideo(video, 'w-full aspect-video rounded-2xl overflow-hidden shadow-lg border border-slate-800'))}
                  </div>
                )}

                <div className={`${gridFooter} gap-10 xl:gap-12 mb-14`}>
                  {/* Brand */}
                  <div className="col-span-1 sm:col-span-2 xl:col-span-2">
                    <div className="flex items-center gap-3 mb-5">
                      <Logo size="md" />
                      <div>
                        <h3 className="font-black text-white text-base">{t.companyName}</h3>
                        <p className="text-xs font-semibold" style={{ color: tc }}>{t.brandTag}</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-xs">{t.heroDesc}</p>
                    {/* Social Links */}
                    {landingConfig.socialLinks && Object.keys(landingConfig.socialLinks).length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {landingConfig.socialLinks?.facebook && (
                          <a href={landingConfig.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"><Facebook size={16} /></a>
                        )}
                        {landingConfig.socialLinks?.twitter && (
                          <a href={landingConfig.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"><Twitter size={16} /></a>
                        )}
                        {landingConfig.socialLinks?.linkedin && (
                          <a href={landingConfig.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"><Linkedin size={16} /></a>
                        )}
                        {landingConfig.socialLinks?.instagram && (
                          <a href={landingConfig.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"><Instagram size={16} /></a>
                        )}
                        {landingConfig.socialLinks?.youtube && (
                          <a href={landingConfig.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-all"><Youtube size={16} /></a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Links */}
                  <div>
                    <h4 className="font-black text-white text-sm mb-5">{t.quickLinks}</h4>
                    <ul className="space-y-3">
                      {navLinks.map((link) => (
                        <li key={link.id}>
                          <button onClick={() => scrollTo(link.id)} className="footer-link text-sm text-slate-400 font-semibold text-left">{link.label}</button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Products */}
                  <div>
                    <h4 className="font-black text-white text-sm mb-5">{t.navProducts}</h4>
                    <ul className="space-y-3">
                      {products.slice(0, 6).map((prod) => (
                        <li key={prod.id}>
                          <span className="footer-link text-sm text-slate-400 font-semibold cursor-default">{isRTL ? prod.titleAr : prod.titleEn}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Contact */}
                  <div>
                    <h4 className="font-black text-white text-sm mb-5">{t.contactUs}</h4>
                    <div className="space-y-4">
                      {t.locDesc && (
                        <div className="flex items-start gap-3">
                          <MapPin size={14} style={{ color: tc }} className="mt-0.5 shrink-0" />
                          <span className="text-sm text-slate-400 leading-relaxed">{t.locDesc}</span>
                        </div>
                      )}
                      {landingConfig.phone && (
                        <a href={`tel:${landingConfig.phone}`} className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors">
                          <Phone size={14} style={{ color: tc }} /><span className="text-sm font-semibold">{landingConfig.phone}</span>
                        </a>
                      )}
                      {landingConfig.email && (
                        <a href={`mailto:${landingConfig.email}`} className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors">
                          <Mail size={14} style={{ color: tc }} /><span className="text-sm font-semibold">{landingConfig.email}</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Bottom */}
                <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <p className="text-sm text-slate-500">{t.footer}</p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-white transition-colors">
                      <Globe size={14} /> {t.langSwitch}
                    </button>
                  </div>
                </div>
              </div>
            </footer>
          </main>

          {/* SCROLL TO TOP */}
          <button
            onClick={scrollTopFn}
            className={`fixed bottom-6 z-40 w-12 h-12 rounded-2xl text-white shadow-2xl flex items-center justify-center btn-primary transition-all duration-500 ${isRTL ? 'left-6' : 'right-6'} ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
            aria-label="Back to top"
          >
            <ChevronUp size={22} />
          </button>
        </>
      )}

      {/* ══ PRODUCT DETAILS MODAL ══ */}
      {selectedProduct && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSelectedProduct(null)}>
          <div
            className="bg-white rounded-[2rem] w-full max-w-5xl overflow-hidden shadow-2xl relative animate-[fadeIn_0.3s_ease] flex flex-col md:flex-row h-[85vh] md:h-[600px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedProduct(null)}
              className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center text-slate-600 hover:text-rose-500 hover:bg-rose-50 shadow-md z-20 transition-all`}
            >
              <X size={20} />
            </button>

            {/* Image Side */}
            <div className="w-full md:w-1/2 h-64 md:h-full bg-white relative group overflow-hidden border-b md:border-b-0 md:border-l border-slate-100 flex items-center justify-center">
              {selectedProduct.imageUrl ? (
                <>
                  <img src={selectedProduct.imageUrl} alt={isRTL ? selectedProduct.titleAr : selectedProduct.titleEn} className="max-w-full max-h-full object-contain p-4" />
                  <div
                    className="absolute inset-0 bg-slate-900/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    onClick={() => { setFullScreenImage(selectedProduct.imageUrl || ''); setZoomLevel(1); }}
                  >
                    <div className="bg-white/95 backdrop-blur text-slate-900 px-5 py-2.5 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 transform transition-transform hover:scale-105">
                      <ZoomIn size={18} className="text-indigo-600" /> {isRTL ? 'تكبير وعرض' : 'Zoom & View'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-50"><Package size={64} className="text-slate-300" /></div>
              )}
            </div>

            {/* Details Side */}
            <div className="w-full md:w-1/2 p-6 sm:p-10 flex flex-col h-full overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
              {selectedProduct.category && (
                <span className="inline-flex w-fit text-[12px] font-black uppercase tracking-wider px-4 py-1.5 rounded-full mb-5" style={{ background: `rgba(${tcRgb},0.1)`, color: tc }}>
                  {selectedProduct.category}
                </span>
              )}
              <h3 className="text-3xl sm:text-4xl font-black text-slate-900 mb-4 leading-tight">{isRTL ? selectedProduct.titleAr : selectedProduct.titleEn}</h3>
              <p className="text-lg font-bold text-slate-500 mb-6 leading-relaxed">{isRTL ? (selectedProduct.descAr || selectedProduct.countAr) : (selectedProduct.descEn || selectedProduct.countEn)}</p>

              {(selectedProduct.detailsAr || selectedProduct.detailsEn) && (
                <div className="mt-4 pt-6 border-t border-slate-100 flex-1">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2"><FileText size={16} /> {isRTL ? 'التفاصيل والمعلومات الطبية' : 'Product Details'}</h4>
                  <p className="text-slate-700 leading-loose text-sm sm:text-base whitespace-pre-wrap">{isRTL ? (selectedProduct.detailsAr || selectedProduct.detailsEn) : (selectedProduct.detailsEn || selectedProduct.detailsAr)}</p>
                </div>
              )}

              {/* Review Section */}
              <div className="mt-8 pt-8 border-t border-slate-100">
                <h4 className="font-black text-slate-800 mb-6 flex items-center gap-2"><Star size={18} className="text-amber-400 fill-amber-400" /> {isRTL ? 'تقييم ومراجعة المنتج' : 'Rate & Review'}</h4>
                {reviewSubmitted ? (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center animate-[fadeIn_0.5s_ease]">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3"><Check size={32} className="text-emerald-500" /></div>
                    <h5 className="font-black text-emerald-700 text-lg mb-1">{isRTL ? 'شكراً لمراجعتك!' : 'Thank you!'}</h5>
                    <p className="text-sm text-emerald-600 font-semibold">{isRTL ? 'تم استلام تقييمك بنجاح سيتم مراجعته قريباً.' : 'Your review has been submitted successfully.'}</p>
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setReviewSubmitted(true);
                      try {
                        await reviewService.create({
                          product_id: selectedProduct.id,
                          product_name: isRTL ? selectedProduct.titleAr : selectedProduct.titleEn,
                          customer_name: reviewForm.name,
                          customer_email: reviewForm.email,
                          review_text: reviewForm.text,
                          rating: reviewForm.rating,
                        } as unknown as Record<string, unknown>);
                      } catch (err: unknown) {
                        console.error('Failed to submit review', err);
                      }
                    }}
                    className="space-y-4"
                  >
                    <div className="flex justify-center gap-2 mb-6">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button key={star} type="button" onClick={() => setReviewForm({ ...reviewForm, rating: star })} className="focus:outline-none transition-transform hover:scale-110 active:scale-95">
                          <Star size={36} className={`transition-colors ${star <= reviewForm.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input type="text" required placeholder={isRTL ? 'الاسم الكامل *' : 'Full Name *'} value={reviewForm.name} onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 transition-colors" />
                      <input type="email" required placeholder={isRTL ? 'البريد الإلكتروني *' : 'Email Address *'} value={reviewForm.email} onChange={(e) => setReviewForm({ ...reviewForm, email: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 transition-colors" />
                    </div>
                    <textarea required placeholder={isRTL ? 'اكتب مراجعتك وتجربتك مع المنتج هنا...' : 'Write your review here...'} rows={4} value={reviewForm.text} onChange={(e) => setReviewForm({ ...reviewForm, text: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-400 transition-colors resize-none" />
                    <button type="submit" disabled={reviewForm.rating === 0} className="w-full py-3.5 text-white font-black rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-lg hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)` }}>
                      <Send size={16} /> {isRTL ? 'إرسال التقييم' : 'Submit Review'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ AGENT DETAILS MODAL ══ */}
      {selectedAgent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-sm" onClick={() => setSelectedAgent(null)}>
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl relative animate-[fadeIn_0.3s_ease]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelectedAgent(null)} className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors z-10`}>
              <X size={20} />
            </button>
            <div className="p-8 text-center" dir={isRTL ? 'rtl' : 'ltr'}>
              <div className="w-32 h-32 mx-auto mb-6 flex items-center justify-center bg-slate-50 rounded-2xl border border-slate-100 p-4">
                {selectedAgent.logoUrl ? (
                  <img src={selectedAgent.logoUrl} alt={selectedAgent.name} className="max-w-full max-h-full object-contain" />
                ) : (
                  <Building2 size={48} style={{ color: tc }} className="opacity-40" />
                )}
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">{selectedAgent.name}</h3>
              {selectedAgent.details && <p className="text-sm font-medium text-slate-600 mb-6 leading-relaxed">{selectedAgent.details}</p>}
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8 border-t border-slate-100 pt-6">
                {selectedAgent.websiteUrl && (
                  <a
                    href={selectedAgent.websiteUrl.startsWith('http') ? selectedAgent.websiteUrl : `https://${selectedAgent.websiteUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 px-4 rounded-xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 shadow-md"
                    style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)` }}
                  >
                    <Globe size={16} /> {isRTL ? 'الموقع الإلكتروني' : 'Website'}
                  </a>
                )}
                {selectedAgent.mapUrl && (
                  <a
                    href={(() => {
                      const url = selectedAgent.mapUrl || '';
                      if (url.includes('<iframe')) {
                        const match = url.match(/src="([^"]+)"/);
                        return match ? match[1] : '#';
                      }
                      if (url.startsWith('http')) return url;
                      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(url)}`;
                    })()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all hover:-translate-y-0.5"
                  >
                    <MapPin size={16} className="text-rose-500" /> {isRTL ? 'عرض الموقع' : 'Show Location'}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ FULLSCREEN IMAGE LIGHTBOX ══ */}
      {fullScreenImage && (
        <div className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-xl flex flex-col animate-[fadeIn_0.3s_ease]" onClick={() => setFullScreenImage(null)}>
          <div className="flex items-center justify-between p-4 sm:p-6 text-white absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
            <div className="flex items-center gap-3 bg-white/10 p-1.5 rounded-2xl backdrop-blur-md pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.5))} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors shadow-sm"><ZoomOut size={20} /></button>
              <span className="w-14 text-center font-mono font-bold text-sm">{Math.round(zoomLevel * 100)}%</span>
              <button onClick={() => setZoomLevel((z) => Math.min(4, z + 0.5))} className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors shadow-sm"><ZoomIn size={20} /></button>
            </div>
            <button onClick={() => setFullScreenImage(null)} className="w-12 h-12 bg-white/10 hover:bg-rose-500 rounded-2xl flex items-center justify-center transition-all shadow-lg backdrop-blur-md pointer-events-auto"><X size={24} /></button>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-0 hide-scrollbar" style={{ touchAction: 'pan-x pan-y' }}>
            <img
              src={fullScreenImage}
              alt="Fullscreen Viewer"
              className="object-contain transition-all duration-300"
              style={{ width: `${zoomLevel * 100}%`, height: `${zoomLevel * 100}%`, minWidth: '100%', minHeight: '100%', cursor: zoomLevel > 1 ? 'grab' : 'zoom-in' }}
              onClick={(e) => { e.stopPropagation(); setZoomLevel((z) => (z === 1 ? 2 : 1)); }}
            />
          </div>
          <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
            <span className="bg-black/50 backdrop-blur-md text-white/80 text-xs font-bold px-4 py-2 rounded-full shadow-lg">{isRTL ? 'انقر للتكبير/التصغير، واسحب للتحريك' : 'Click to zoom, drag to pan'}</span>
          </div>
        </div>
      )}

      {/* ══ PRODUCTS PORTAL ══ */}
      {showProductsPortal && (
        <div className="flex-1 bg-slate-50 flex flex-col animate-[fadeIn_0.3s_ease]" dir={isRTL ? 'rtl' : 'ltr'}>
          {/* Portal Header */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between shrink-0 shadow-sm sticky top-0 z-30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-md" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)` }}><Package size={24} className="text-white" /></div>
              <div>
                <h2 className="font-black text-xl text-slate-800">{isRTL ? 'لوحة المنتجات والخدمات' : 'Kyvzon Products'}</h2>
                <p className="text-sm font-bold text-slate-500">{t.companyName}</p>
              </div>
            </div>
            <button onClick={() => { setShowProductsPortal(false); setPortalCategory(''); window.scrollTo(0, 0); }} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl font-bold text-sm transition-all shadow-sm">
              <ArrowLeft size={16} className={isRTL ? 'rotate-180' : ''} /> {isRTL ? 'العودة للرئيسية' : 'Back to Home'}
            </button>
          </div>

          {/* Portal Content */}
          <div className="flex-1 p-4 sm:p-6 md:p-10 relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="max-w-screen-2xl mx-auto relative z-10">
              {/* Categories Selection */}
              <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-slate-100 mb-10">
                <h3 className="text-center font-black text-2xl text-slate-800 mb-2">{isRTL ? 'اختر تصنيف المنتج لعرض القائمة' : 'Select Category to view products'}</h3>
                <p className="text-center text-slate-500 font-semibold mb-8">{isRTL ? 'يرجى تحديد القسم المطلوب' : 'Please select a specific category'}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setPortalCategory(cat)}
                      className={`px-6 py-3.5 rounded-2xl font-black text-sm md:text-base transition-all duration-300 border-2 flex items-center gap-2 ${
                        portalCategory === cat
                          ? 'text-white shadow-lg border-transparent scale-105'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                      style={portalCategory === cat ? { background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 8px 25px rgba(${tcRgb},0.35)` } : {}}
                    >
                      <Check size={18} className={portalCategory === cat ? 'opacity-100' : 'opacity-0 hidden'} />
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Display */}
              {!portalCategory ? (
                <div className="text-center py-20 animate-[fadeIn_0.5s_ease]">
                  <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-6 opacity-50"><Package size={48} className="text-slate-400" /></div>
                  <h4 className="text-2xl font-black text-slate-400">{isRTL ? 'بانتظار اختيار الصنف...' : 'Waiting for category selection...'}</h4>
                </div>
              ) : portalProducts.length === 0 ? (
                <div className="text-center py-20 animate-[fadeIn_0.5s_ease]">
                  <Package size={48} className="text-slate-300 mx-auto mb-4" />
                  <h4 className="text-xl font-bold text-slate-500">{isRTL ? 'لا توجد منتجات مسجلة في هذا الصنف حالياً' : 'No products found in this category'}</h4>
                </div>
              ) : (
                <div className="animate-[fadeIn_0.5s_ease]">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                      <span className="w-3 h-8 rounded-full" style={{ backgroundColor: tc }} />
                      {portalCategory} <span className="text-sm text-slate-400 font-bold bg-slate-200 px-3 py-1 rounded-full">{portalProducts.length}</span>
                    </h4>
                  </div>
                  <div className={`${gridProducts} gap-6`}>
                    {paginatedProducts.map((prod) => (
                      <div
                        key={prod.id}
                        className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-2xl transition-all duration-500 overflow-hidden flex flex-col h-full cursor-pointer hover:-translate-y-2"
                        onClick={() => setSelectedProduct(prod)}
                      >
                        <div className="relative h-56 overflow-hidden bg-white border-b border-slate-100 flex items-center justify-center p-4">
                          {prod.imageUrl ? (
                            <img src={prod.imageUrl} alt={prod.titleAr} className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-110" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Package size={48} className="text-slate-300" /></div>
                          )}
                          <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <div className="bg-white/20 backdrop-blur-md px-6 py-3 rounded-full text-white font-bold flex items-center gap-2"><Eye size={18} /> {isRTL ? 'التفاصيل والتقييم' : 'View & Rate'}</div>
                          </div>
                        </div>
                        <div className="p-6 flex-1 flex flex-col">
                          <h4 className="font-black text-slate-800 text-lg mb-2">{isRTL ? prod.titleAr : prod.titleEn}</h4>
                          <p className="text-sm font-bold text-slate-500 mb-4">{isRTL ? (prod.descAr || prod.countAr) : (prod.descEn || prod.countEn)}</p>
                          <div className="mt-auto flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((s) => <Star key={s} size={14} className="text-slate-300" />)}
                            <span className="text-xs font-bold text-slate-400 mx-2">{isRTL ? 'لم يقيّم بعد' : 'No ratings'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-12 pt-8 border-t border-slate-200">
                      <button onClick={() => setPortalPage((p) => Math.max(1, p - 1))} disabled={portalPage === 1} className="p-3 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm">
                        {isRTL ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                      </button>
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: totalPages }).map((_, i) => (
                          <button
                            key={i}
                            onClick={() => setPortalPage(i + 1)}
                            className={`w-11 h-11 rounded-xl font-bold text-base transition-all shadow-sm ${portalPage === i + 1 ? 'text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            style={portalPage === i + 1 ? { background: `linear-gradient(135deg, ${tc}, ${tc}cc)` } : {}}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setPortalPage((p) => Math.min(totalPages, p + 1))} disabled={portalPage === totalPages} className="p-3 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-all shadow-sm">
                        {isRTL ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
