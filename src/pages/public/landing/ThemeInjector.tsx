/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ThemeInjector — يحقن ثيم الموقع (ألوان + خطوط) ديناميكياً في .kv-root
 *
 *  يقرأ theme من PublicSiteConfig ويحدّث متغيرات CSS (--kv-*) + يحمّل خط Google.
 *  النتيجة: تغيير اللون/الخط من لوحة المطوّر ينعكس على الموقع كله فوراً.
 *  إن لم يوجد theme مخصّص → يبقى الثيم الافتراضي من styles.css كما هو.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect } from 'react';
import type { PublicSiteTheme } from '../../../services/sdk';

/** يشتق درجة أفتح/أنعم من لون hex للاستخدام كخلفية ناعمة */
function softTint(hex: string, alpha = 0.09): string {
  const m = hex.replace('#', '');
  if (m.length !== 6) return 'rgba(20,102,216,0.09)';
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const LOADED_FONTS = new Set<string>();
function loadGoogleFont(family: string) {
  if (!family || LOADED_FONTS.has(family)) return;
  LOADED_FONTS.add(family);
  const fam = family.trim().replace(/ /g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;600;700;800;900&display=swap`;
  link.dataset.kvFont = family;
  document.head.appendChild(link);
}

export function useThemeInjector(theme?: PublicSiteTheme | null) {
  useEffect(() => {
    if (!theme) return;
    const root = document.querySelector('.kv-root') as HTMLElement | null;
    if (!root) return;

    const set = (k: string, v?: string) => { if (v) root.style.setProperty(k, v); };

    // الألوان
    if (theme.brandColor) {
      set('--kv-accent-1', theme.brandColor);
      set('--kv-accent-soft', softTint(theme.brandColor, 0.09));
    }
    if (theme.brandDark) {
      set('--kv-accent-2', theme.brandDark);
      set('--kv-accent-3', theme.brandDark);
    }
    if (theme.brandColor && theme.brandDark) {
      set('--kv-accent-grad', `linear-gradient(135deg, ${theme.brandColor} 0%, ${theme.brandDark} 100%)`);
      set('--kv-accent-grad-full', `linear-gradient(120deg, ${theme.accentSky || theme.brandColor}, ${theme.brandColor} 55%, ${theme.brandDark})`);
    }
    set('--kv-accent-sky', theme.accentSky);
    set('--kv-bg-alt', theme.bgAlt);
    set('--kv-text-hi', theme.textHeading);
    set('--kv-text-body', theme.textBody);

    // الخطوط
    if (theme.fontFamily) {
      loadGoogleFont(theme.fontFamily);
      root.style.setProperty('font-family', `'${theme.fontFamily}', 'IBM Plex Sans Arabic', system-ui, sans-serif`);
    }
    if (theme.headingFontFamily) {
      loadGoogleFont(theme.headingFontFamily);
      // نطبّق خط العناوين عبر متغيّر تلتقطه قاعدة styles.css
      root.style.setProperty('--kv-heading-font', `'${theme.headingFontFamily}', 'Cairo', sans-serif`);
    }
  }, [theme]);
}
