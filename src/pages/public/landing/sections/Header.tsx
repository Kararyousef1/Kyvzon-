import React, { useState } from 'react';
import { Globe, Menu, X, ChevronDown } from 'lucide-react';
import { useLang, LANG_OPTIONS } from '../LangContext';
import type { LandingConfig } from '../../../../shared/types/landing';

interface HeaderProps {
  onLoginClick: () => void;
  scrolled: boolean;
  activeSection: string;
  landingConfig?: Partial<LandingConfig> | null;
}

const NAV_IDS = ['home', 'portals', 'pricing', 'services', 'faq', 'contact'] as const;

export function Header({ onLoginClick, scrolled, activeSection, landingConfig }: HeaderProps) {
  const { lang, setLang, isRTL, t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);

  const NAV = NAV_IDS.map((id) => ({ id, label: t(`nav_${id}`) }));

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-400 ${scrolled ? 'glass-header' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-16 md:h-18">
        {/* Logo */}
        <button
          className="flex items-center gap-3 cursor-pointer bg-transparent border-none p-0"
          onClick={() => scrollTo('home')}
          aria-label={lang === 'ar' ? 'الانتقال إلى الرئيسية' : lang === 'en' ? 'Go to homepage' : 'گەڕانەوە بۆ ماڵەوە'}
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/30" style={{ background: landingConfig?.themeColor ? `linear-gradient(135deg, ${landingConfig.themeColor}, ${landingConfig.themeColor}bb)` : undefined }}>{landingConfig?.logoUrl ? <img src={landingConfig.logoUrl} alt="KYVZON" className="w-full h-full rounded-xl object-cover" /> : (landingConfig?.logoSymbol || 'K')}</div>
          <span className="text-xl font-black tracking-tight text-white">{landingConfig?.logoTextEn || 'KYVZON'}</span>
        </button>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1" aria-label={lang === 'ar' ? 'التنقل الرئيسي' : 'Main navigation'}>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => scrollTo(n.id)}
              className={`nav-pill ${activeSection === n.id ? 'active' : ''}`}
              aria-current={activeSection === n.id ? 'true' : undefined}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {/* Language selector */}
          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/08 transition-all"
              aria-label={lang === 'ar' ? 'تغيير اللغة' : lang === 'en' ? 'Change language' : 'گۆڕینی زمان'}
              aria-haspopup="true"
            >
              <Globe size={14} />
              <span>{LANG_OPTIONS.find((l) => l.code === lang)?.flag} {LANG_OPTIONS.find((l) => l.code === lang)?.label}</span>
              <ChevronDown size={12} />
            </button>
            <div
              className="absolute top-full mt-2 bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-all z-50 min-w-[130px]"
              style={{ [isRTL ? 'right' : 'left']: 0 }}
            >
              {LANG_OPTIONS.map((lo) => (
                <button
                  key={lo.code}
                  onClick={() => setLang(lo.code)}
                  className={`w-full text-left px-4 py-2.5 text-sm hover:bg-white/08 transition-all flex items-center gap-2 ${lang === lo.code ? 'text-indigo-400 font-bold' : 'text-white/70'}`}
                  aria-current={lang === lo.code ? 'true' : undefined}
                >
                  {lo.flag} {lo.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={onLoginClick} className="hidden sm:flex btn-primary py-2 px-5 text-sm">{t('login')}</button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="lg:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/08 transition-all"
            aria-label={menuOpen ? (lang === 'ar' ? 'إغلاق القائمة' : lang === 'en' ? 'Close menu' : 'داخستنی لیست') : (lang === 'ar' ? 'فتح القائمة' : lang === 'en' ? 'Open menu' : 'کردنەوەی لیست')}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="lg:hidden glass-dark border-t border-white/06 px-4 py-4 flex flex-col gap-1">
          {NAV.map((n) => (
            <button key={n.id} onClick={() => scrollTo(n.id)} className={`nav-pill text-right w-full py-3 ${activeSection === n.id ? 'active' : ''}`}>
              {n.label}
            </button>
          ))}
          <button onClick={onLoginClick} className="btn-primary mt-2 w-full text-center py-3">{t('login')}</button>
        </div>
      )}
    </header>
  );
}
