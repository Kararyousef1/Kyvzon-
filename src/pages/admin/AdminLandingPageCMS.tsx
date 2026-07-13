/**
 * ════════════════════════════════════════════════════════════════
 *  AdminLandingPageCMS - إدارة صفحة الزوار (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 40 استخدام any → 0 (أنواع موسّعة محلياً)
 *  ✅ تنظيف جميع markdown artifacts (100+ موضع)
 *  ✅ catch (err: any) → catch (err: unknown) + getErrorMessage
 *  ✅ LandingProductExtended / CMSConfig يحلّان جذرياً نقص الحقول
 *  ════════════════════════════════════════════════════════════════
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Save, Globe, Eye, Palette, Type, Image as ImageIcon, Box,
  Link2, Plus, Trash2, X, Video, Upload, Layout,
  Monitor, Smartphone, GripVertical, ExternalLink, Check, ArrowRight,
  AlertCircle, RefreshCw, ChevronDown, Layers,
  Hash, FileText, MapPin, Phone, Mail, Facebook, Twitter,
  Linkedin, Instagram, Youtube, Star, Copy, Play,
  Loader2, Info, Sparkles, BarChart3, Package, ArrowUp,
  ArrowDown, Search, Grid, List, Zap, Shield, Award,
  Tablet, RotateCcw, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, Users,
} from 'lucide-react';
import {
  useUIStore,
  LandingProduct,
  LandingNavLink,
  LandingVideo,
  LandingConfig,
} from '../../core/stores';
import { supabase } from '../../services/supabase/supabase';
import { settingsService } from '../../services/sdk';
import LandingPage from '../public/LandingPage';
import { getErrorMessage } from '../../services/errors';

// ════════════════════════════════════════════════════════════════
//  أنواع موسّعة محلياً (تحلّ محل any جذرياً)
// ════════════════════════════════════════════════════════════════

/** منتج الصفحة بحقول إضافية (category, desc, details) */
interface LandingProductExtended extends LandingProduct {
  category?: string;
  descAr?: string;
  descEn?: string;
  detailsAr?: string;
  detailsEn?: string;
}

/** وكيل/موزّع — نموذج CMS المبسّط (حقل اسم موحّد) */
interface CMSAgent {
  id: string;
  name: string;
  logoUrl?: string;
  details?: string;
  websiteUrl?: string;
  mapUrl?: string;
  order?: number;
}

/** إحصائية عرض — نموذج CMS المبسّط */
interface CMSStat {
  id: string;
  value: number;
  suffix?: string;
  labelAr: string;
  labelEn: string;
}

/** روابط التواصل الاجتماعي */
interface SocialLinks {
  facebook?: string;
  twitter?: string;
  linkedin?: string;
  instagram?: string;
  youtube?: string;
  [key: string]: string | undefined;
}

/**
 * تكوين الصفحة الكامل — كل الحقول اختيارية لإدارة CMS.
 * لا يوسّع LandingConfig مباشرة لتجنب تضارب required vs optional.
 * يُحوَّل إلى LandingConfig عند الحفظ في store.
 */
interface CMSConfig {
  themeColor?: string;
  logoSymbol?: string;
  logoUrl?: string;
  logoTextAr?: string;
  logoTextEn?: string;
  heroTitleAr?: string;
  heroTitleEn?: string;
  heroDescAr?: string;
  heroDescEn?: string;
  aboutP1Ar?: string;
  aboutP1En?: string;
  aboutP2Ar?: string;
  aboutP2En?: string;
  aboutP3Ar?: string;
  aboutP3En?: string;
  addressAr?: string;
  addressEn?: string;
  mapUrl?: string;
  showCareSection?: boolean;
  showAgentsSection?: boolean;
  showLocationSection?: boolean;
  showMarketingSection?: boolean;
  showVideoSection?: boolean;
  showStatsSection?: boolean;
  marketingTitleAr?: string;
  marketingTitleEn?: string;
  marketingIntroAr?: string;
  marketingIntroEn?: string;
  marketingVisionTitleAr?: string;
  marketingVisionTitleEn?: string;
  marketingVisionTextAr?: string;
  marketingVisionTextEn?: string;
  marketingCommitmentAr?: string;
  marketingCommitmentEn?: string;
  youtubeUrl?: string;
  phone?: string;
  email?: string;
  products?: LandingProductExtended[];
  videos?: LandingVideo[];
  customNavLinks?: LandingNavLink[];
  stats?: CMSStat[];
  agents?: CMSAgent[];
  socialLinks?: SocialLinks;
}

/** مفتاح حقل قابل للتحديث ديناميكياً */
type ConfigField = keyof CMSConfig;

// ════════════════════════════════════════════════════
// UTILITY HELPERS
// ════════════════════════════════════════════════════

const generateId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const THEME_PRESETS = [
  { name: 'Indigo',  color: '#4f46e5', label: 'نيلي',    gradient: 'from-indigo-500 to-indigo-700' },
  { name: 'Sky',     color: '#0ea5e9', label: 'سماوي',   gradient: 'from-sky-400 to-sky-600' },
  { name: 'Emerald', color: '#10b981', label: 'زمردي',   gradient: 'from-emerald-400 to-emerald-600' },
  { name: 'Amber',   color: '#f59e0b', label: 'عنبري',   gradient: 'from-amber-400 to-amber-600' },
  { name: 'Rose',    color: '#ef4444', label: 'وردي',    gradient: 'from-rose-400 to-rose-600' },
  { name: 'Violet',  color: '#8b5cf6', label: 'بنفسجي',  gradient: 'from-violet-400 to-violet-600' },
  { name: 'Pink',    color: '#ec4899', label: 'زهري',    gradient: 'from-pink-400 to-pink-600' },
  { name: 'Teal',    color: '#0d9488', label: 'فيروزي',  gradient: 'from-teal-500 to-teal-700' },
  { name: 'Orange',  color: '#ea580c', label: 'برتقالي', gradient: 'from-orange-500 to-orange-700' },
  { name: 'Slate',   color: '#0f172a', label: 'داكن',    gradient: 'from-slate-700 to-slate-900' },
];

const VIDEO_PLACEMENTS = [
  { value: 'hero',              emoji: '🎯', ar: 'القسم الرئيسي', en: 'Hero Section' },
  { value: 'about',             emoji: '🏢', ar: 'من نحن',         en: 'About Section' },
  { value: 'dedicated_section', emoji: '🎬', ar: 'قسم مخصص',      en: 'Dedicated Section' },
  { value: 'footer',            emoji: '⬇️', ar: 'الفوتر',         en: 'Footer' },
];

const PRODUCT_CATEGORIES = ['حبوب', 'مراهم وكريمات', 'شرابات', 'مساحيق'];

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
};

const getYoutubeThumb = (url: string) => {
  const match = url?.match(/(?:youtu\.be\/|v=)([^#&?\s]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
};

// ════════════════════════════════════════════════════
// SMALL REUSABLE COMPONENTS
// ════════════════════════════════════════════════════

type ToastType = 'success' | 'error' | 'info' | 'warning';

const Toast = ({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onClose, 4500);
    return () => clearTimeout(t);
  }, [onClose]);

  const styles: Record<ToastType, string> = {
    success: 'bg-emerald-500 shadow-emerald-200',
    error: 'bg-red-500 shadow-red-200',
    info: 'bg-blue-500 shadow-blue-200',
    warning: 'bg-amber-500 shadow-amber-200',
  };

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[99999] flex items-center gap-3 px-5 py-3.5 rounded-2xl text-white font-bold text-sm shadow-2xl ${styles[type]} max-w-sm w-full mx-4`}>
      <span className="shrink-0">
        {type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
      </span>
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"><X size={15} /></button>
    </div>
  );
};

const Badge = ({ count, color = 'bg-indigo-500' }: { count: number; color?: string }) => (
  <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-white text-[11px] font-black ${color}`}>{count}</span>
);

const Field = ({ label, hint, required, children, action }: {
  label: string; hint?: string; required?: boolean;
  children: React.ReactNode; action?: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-red-400 text-xs">*</span>}
      </label>
      {action}
    </div>
    {children}
    {hint && <p className="flex items-center gap-1 text-xs text-slate-400 font-medium"><Info size={10} className="shrink-0" />{hint}</p>}
  </div>
);

const Input = ({ value, onChange, name, placeholder = '', dir = 'rtl', type = 'text', className = '', disabled = false, icon, onKeyDown }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  name?: string; placeholder?: string; dir?: 'rtl' | 'ltr';
  type?: string; className?: string; disabled?: boolean;
  icon?: React.ReactNode; onKeyDown?: (e: React.KeyboardEvent) => void;
}) => (
  <div className="relative">
    {icon && <div className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none z-10">{icon}</div>}
    <input
      type={type} name={name} value={value} onChange={onChange}
      placeholder={placeholder} dir={dir} disabled={disabled} onKeyDown={onKeyDown}
      className={`w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed ${icon ? 'pr-9' : ''} ${className}`}
    />
  </div>
);

const Textarea = ({ value, onChange, name, placeholder = '', dir = 'rtl', rows = 3 }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  name?: string; placeholder?: string; dir?: 'rtl' | 'ltr'; rows?: number;
}) => (
  <textarea
    name={name} value={value} onChange={onChange} placeholder={placeholder} dir={dir} rows={rows}
    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-300 resize-none"
  />
);

const Toggle = ({ checked, onChange, label, desc, color = 'bg-indigo-500' }: {
  checked: boolean; onChange: (val: boolean) => void;
  label: string; desc?: string; color?: string;
}) => (
  <div
    onClick={() => onChange(!checked)}
    className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${checked ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
  >
    <div className="flex-1">
      <p className="font-bold text-slate-800 text-sm">{label}</p>
      {desc && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>}
    </div>
    <div className={`relative w-12 h-6 rounded-full transition-all duration-300 shrink-0 mr-4 ${checked ? color : 'bg-slate-200'}`}>
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${checked ? 'right-1' : 'left-1'}`} />
    </div>
  </div>
);

const SectionCard = ({ title, icon: Icon, iconColor = 'text-indigo-600', iconBg = 'bg-indigo-50', children, collapsible = false, defaultOpen = true, badge, actions }: {
  title: string; icon: React.ElementType; iconColor?: string; iconBg?: string;
  children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean;
  badge?: React.ReactNode; actions?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-white ${collapsible ? 'cursor-pointer hover:bg-slate-50' : ''} transition-colors`} onClick={collapsible ? () => setOpen(o => !o) : undefined}>
        <div className="flex items-center gap-3 flex-1 min-w-[150px]">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}><Icon size={18} className={iconColor} /></div>
          <h3 className="font-black text-slate-800 truncate">{title}</h3>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
        {actions && <div className="shrink-0 w-full sm:w-auto flex justify-end" onClick={e => e.stopPropagation()}>{actions}</div>}
        {collapsible && <div className="shrink-0 text-slate-400 transition-transform duration-300" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}><ChevronDown size={16} /></div>}
      </div>
      {open && <div className="p-6">{children}</div>}
    </div>
  );
};

const ImageUpload = ({ value, onChange, label, aspectRatio = 'landscape', compact = false }: {
  value: string; onChange: (url: string) => void;
  label: string; aspectRatio?: 'landscape' | 'square'; compact?: boolean;
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('الملف يجب أن يكون صورة'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('الحجم الأقصى 5MB'); return; }
    setUploading(true); setError('');
    try {
      const ext = file.name.split('.').pop();
      const path = `landing/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('public-assets').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('public-assets').getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      setError(getErrorMessage(err, 'خطأ في الرفع'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && <label className="block text-xs font-bold text-slate-500">{label}</label>}
      <div className="flex gap-2">
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="https://... أو ارفع صورة" dir="ltr" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all" />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50 active:scale-95">
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? 'رفع...' : 'رفع'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
      {!value && !compact && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          onClick={() => fileRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 py-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
        >
          <Upload size={16} className="text-slate-300" />
          <p className="text-xs text-slate-400 font-medium">اسحب أو <span className="text-indigo-500 font-bold">اختر صورة</span></p>
          <p className="text-[10px] text-slate-300">PNG, JPG, WebP — حتى 5MB</p>
        </div>
      )}
      {error && <p className="flex items-center gap-1 text-xs text-rose-600 font-bold"><AlertCircle size={11} />{error}</p>}
      {value && (
        <div className={`relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group ${aspectRatio === 'square' ? 'w-24 h-24' : 'w-full h-28'}`}>
          <img src={value} alt="preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button onClick={() => fileRef.current?.click()} className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow"><Upload size={14} /></button>
            <button onClick={() => onChange('')} className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-700 hover:bg-rose-50 hover:text-rose-600 transition-all shadow"><Trash2 size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
};

const Divider = ({ label }: { label?: string }) => (
  <div className="flex items-center gap-3 my-2">
    <div className="flex-1 h-px bg-slate-100" />
    {label && <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</span>}
    <div className="flex-1 h-px bg-slate-100" />
  </div>
);

// ════════════════════════════════════════════════════
// PRODUCT CARD COMPONENT
// ════════════════════════════════════════════════════

const ProductCard = ({ product, idx, onUpdate, onRemove, onDuplicate, onMove, isLast, view }: {
  product: LandingProductExtended; idx: number;
  onUpdate: (id: string, field: keyof LandingProductExtended, value: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (p: LandingProductExtended) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  isLast: boolean; view: 'grid' | 'list';
}) => {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'ar' | 'en'>('ar');

  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:border-amber-200 transition-all duration-300 group">
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-white border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripVertical size={14} className="text-slate-300 shrink-0" />
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center text-[11px] font-black shrink-0">{idx + 1}</div>
          <div className="min-w-0 flex-1">
            <p className="font-black text-slate-800 text-sm truncate">{product.titleAr || 'منتج جديد'}</p>
            {product.category ? (
              <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded-full">{product.category}</span>
            ) : (
              <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200">غير مصنف (لن يظهر للزوار)</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onMove(product.id, 'up')} disabled={idx === 0} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"><ArrowUp size={12} /></button>
          <button onClick={() => onMove(product.id, 'down')} disabled={isLast} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"><ArrowDown size={12} /></button>
          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          <button onClick={() => onDuplicate(product)} className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all" title="نسخ"><Copy size={12} /></button>
          <button onClick={() => setExpanded(e => !e)} className={`p-1.5 rounded-lg transition-all ${expanded ? 'bg-amber-100 text-amber-600' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`} title={expanded ? 'طي' : 'توسيع'}>
            <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => onRemove(product.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="حذف"><Trash2 size={12} /></button>
        </div>
      </div>

      <div className="p-4">
        <div className={`flex gap-4 ${view === 'list' ? 'items-center' : 'flex-col'}`}>
          <div className={`relative rounded-xl overflow-hidden bg-slate-50 border-2 border-dashed border-slate-200 shrink-0 flex items-center justify-center cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-all group/img ${view === 'list' ? 'w-20 h-20' : 'w-full h-36'}`}>
            {product.imageUrl ? (
              <>
                <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center"><span className="text-white text-xs font-bold">تغيير</span></div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1 text-slate-300"><ImageIcon size={20} /><span className="text-[10px] font-bold">أضف صورة</span></div>
            )}
          </div>

          <div className="flex-1 space-y-2.5 min-w-0">
            <div className="flex bg-slate-100 rounded-lg p-0.5 w-fit">
              {(['ar', 'en'] as const).map(lang => (
                <button key={lang} onClick={() => setActiveTab(lang)} className={`px-3 py-1.5 rounded-md text-[11px] font-black transition-all ${activeTab === lang ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                  {lang === 'ar' ? '🇸🇦 عربي' : '🇬🇧 English'}
                </button>
              ))}
            </div>
            {activeTab === 'ar' ? (
              <div className="space-y-2">
                <input value={product.titleAr} onChange={e => onUpdate(product.id, 'titleAr', e.target.value)} placeholder="اسم المنتج بالعربي *" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-amber-400 focus:bg-white transition-all" />
                <input value={product.descAr || ''} onChange={e => onUpdate(product.id, 'descAr', e.target.value)} placeholder="وصف مختصر..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-amber-400 transition-all" />
              </div>
            ) : (
              <div className="space-y-2" dir="ltr">
                <input value={product.titleEn} onChange={e => onUpdate(product.id, 'titleEn', e.target.value)} placeholder="Product Name (English) *" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-amber-400 focus:bg-white transition-all" />
                <input value={product.descEn || ''} onChange={e => onUpdate(product.id, 'descEn', e.target.value)} placeholder="Short description..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-amber-400 transition-all" />
              </div>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
            <ImageUpload label="صورة المنتج" value={product.imageUrl} onChange={url => onUpdate(product.id, 'imageUrl', url)} />
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">تفاصيل المنتج (عربي)</label>
                <textarea value={product.detailsAr || ''} onChange={e => onUpdate(product.id, 'detailsAr', e.target.value)} rows={3} placeholder="اكتب التفاصيل الكاملة..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-400 transition-all resize-none" />
              </div>
              <div className="space-y-1.5" dir="ltr">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Product Details (English)</label>
                <textarea value={product.detailsEn || ''} onChange={e => onUpdate(product.id, 'detailsEn', e.target.value)} rows={3} placeholder="Full product details..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-400 transition-all resize-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">التصنيف</label>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => onUpdate(product.id, 'category', product.category === cat ? '' : cat)} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${product.category === cat ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-600'}`}>{cat}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════
// MAIN CMS COMPONENT
// ════════════════════════════════════════════════════

const DEFAULT_CONFIG: CMSConfig = {
  videos: [], products: [], customNavLinks: [],
  themeColor: '#4f46e5', logoTextAr: '', logoTextEn: '', logoUrl: '', logoSymbol: '◆',
  heroTitleAr: '', heroTitleEn: '', heroDescAr: '', heroDescEn: '',
  aboutP1Ar: '', aboutP1En: '', aboutP2Ar: '', aboutP2En: '', aboutP3Ar: '', aboutP3En: '',
  addressAr: '', addressEn: '', mapUrl: '',
  showCareSection: true, showAgentsSection: true, showMarketingSection: true,
  marketingTitleAr: '', marketingTitleEn: '', marketingIntroAr: '', marketingIntroEn: '',
  marketingVisionTitleAr: '', marketingVisionTitleEn: '', marketingVisionTextAr: '', marketingVisionTextEn: '',
  marketingCommitmentAr: '', marketingCommitmentEn: '',
};

export default function AdminLandingPageCMS() {
  const { landingConfig, updateLandingConfig, addToast, setActiveView } = useUIStore();

  const [config, setConfig] = useState<CMSConfig>(() => ({ ...DEFAULT_CONFIG, ...landingConfig } as CMSConfig));
  const [activeTab, setActiveTab] = useState('general');
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productView, setProductView] = useState<'grid' | 'list'>('grid');
  const [productFilter, setProductFilter] = useState('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── Load config ──
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const landingConfigData = await settingsService.findLandingConfig();
        if (landingConfigData) {
          const merged = { ...DEFAULT_CONFIG, ...landingConfig, ...(landingConfigData as Partial<CMSConfig>) } as CMSConfig;
          setConfig(merged);
          updateLandingConfig(merged as unknown as Partial<LandingConfig>);
        }
      } catch (err) {
        console.error('Failed to load config:', getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = useCallback((msg: string, type: ToastType = 'info') => setToast({ msg, type }), []);

  const updateConfig = useCallback((updates: Partial<CMSConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
    setHasChanges(true);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    updateConfig({ [name]: value } as Partial<CMSConfig>);
  }, [updateConfig]);

  // ── Save ──
  const handleSave = async () => {
    setSaving(true);
    try {
      updateLandingConfig(config as unknown as Partial<LandingConfig>);
      await settingsService.updateLandingConfig(config as unknown as Record<string, unknown>);
      setSavedAt(new Date().toLocaleTimeString('ar-SA'));
      setHasChanges(false);
      showToast('تم الحفظ بنجاح ✓', 'success');
      if (addToast) addToast('تم حفظ التغييرات بنجاح!', 'success');
    } catch (err) {
      showToast('خطأ: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('تراجع عن جميع التغييرات غير المحفوظة؟')) return;
    setConfig({ ...DEFAULT_CONFIG, ...landingConfig } as CMSConfig);
    setHasChanges(false);
    showToast('تم التراجع', 'info');
  };

  const handleOpenPreview = useCallback(() => {
    updateLandingConfig(config as unknown as Partial<LandingConfig>);
    setShowPreview(true);
  }, [config, updateLandingConfig]);

  // ── Videos CRUD ──
  const addVideo = () => {
    setConfig(prev => ({ ...prev, videos: [...(prev.videos || []), { id: generateId(), url: '', placement: 'dedicated_section', autoplay: false }] }));
    setHasChanges(true);
  };
  const updateVideo = (id: string, field: keyof LandingVideo, value: string | boolean) => {
    setConfig(prev => ({ ...prev, videos: (prev.videos || []).map(v => v.id === id ? { ...v, [field]: value } : v) }));
    setHasChanges(true);
  };
  const removeVideo = (id: string) => {
    setConfig(prev => ({ ...prev, videos: (prev.videos || []).filter(v => v.id !== id) }));
    setHasChanges(true);
  };

  // ── Products CRUD ──
  const addProduct = () => {
    const newProduct: LandingProductExtended = {
      id: generateId(), titleAr: '', titleEn: '', descAr: '', descEn: '',
      detailsAr: '', detailsEn: '', imageUrl: '', category: '', order: (config.products || []).length,
    };
    setConfig(prev => ({ ...prev, products: [...(prev.products || []), newProduct] }));
    setHasChanges(true);
  };
  const updateProduct = (id: string, field: keyof LandingProductExtended, value: string) => {
    setConfig(prev => ({ ...prev, products: (prev.products || []).map(p => p.id === id ? { ...p, [field]: value } : p) }));
    setHasChanges(true);
  };
  const removeProduct = (id: string) => {
    if (!confirm('حذف هذا المنتج؟')) return;
    setConfig(prev => ({ ...prev, products: (prev.products || []).filter(p => p.id !== id) }));
    setHasChanges(true);
  };
  const duplicateProduct = (product: LandingProductExtended) => {
    setConfig(prev => ({ ...prev, products: [...(prev.products || []), { ...product, id: generateId(), titleAr: (product.titleAr || '') + ' (نسخة)', titleEn: (product.titleEn || '') + ' (Copy)' }] }));
    setHasChanges(true);
  };
  const moveProduct = (id: string, dir: 'up' | 'down') => {
    setConfig(prev => {
      const arr = [...(prev.products || [])];
      const idx = arr.findIndex(p => p.id === id);
      if (dir === 'up' && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
      else if (dir === 'down' && idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      return { ...prev, products: arr };
    });
    setHasChanges(true);
  };

  // ── NavLinks CRUD ──
  const addNavLink = () => {
    const newLink: LandingNavLink = { id: generateId(), labelAr: 'رابط جديد', labelEn: 'New Link', url: 'https://', order: (config.customNavLinks || []).length };
    setConfig(prev => ({ ...prev, customNavLinks: [...(prev.customNavLinks || []), newLink] }));
    setHasChanges(true);
  };
  const updateNavLink = (id: string, field: keyof LandingNavLink, value: string) => {
    setConfig(prev => ({ ...prev, customNavLinks: (prev.customNavLinks || []).map(l => l.id === id ? { ...l, [field]: value } : l) }));
    setHasChanges(true);
  };
  const removeNavLink = (id: string) => {
    setConfig(prev => ({ ...prev, customNavLinks: (prev.customNavLinks || []).filter(l => l.id !== id) }));
    setHasChanges(true);
  };

  // ── Agents CRUD ──
  const addAgent = () => {
    const newAgent: CMSAgent = { id: generateId(), name: 'وكيل جديد', logoUrl: '', details: '', websiteUrl: '', mapUrl: '', order: (config.agents || []).length };
    setConfig(prev => ({ ...prev, agents: [...(prev.agents || []), newAgent] }));
    setHasChanges(true);
  };
  const updateAgent = (id: string, field: keyof CMSAgent, value: string) => {
    setConfig(prev => ({ ...prev, agents: (prev.agents || []).map(a => a.id === id ? { ...a, [field]: value } : a) }));
    setHasChanges(true);
  };
  const removeAgent = (id: string) => {
    setConfig(prev => ({ ...prev, agents: (prev.agents || []).filter(a => a.id !== id) }));
    setHasChanges(true);
  };

  // ── Stats CRUD ──
  const updateStat = (id: string, field: keyof CMSStat, value: string | number) => {
    setConfig(prev => ({ ...prev, stats: (prev.stats || []).map(s => s.id === id ? { ...s, [field]: value } : s) }));
    setHasChanges(true);
  };

  // ── Derived values ──
  const allCategories = [...new Set((config.products || []).map(p => p.category).filter(Boolean) as string[])];
  const filteredProducts = (config.products || []).filter(p => {
    const matchSearch = !productSearch || p.titleAr.includes(productSearch) || p.titleEn.toLowerCase().includes(productSearch.toLowerCase());
    const matchFilter = productFilter === 'all' || p.category === productFilter;
    return matchSearch && matchFilter;
  });

  const tc = config.themeColor || '#4f46e5';
  const tcRgb = hexToRgb(tc);

  const tabs = [
    { id: 'general',  label: 'الهوية',    icon: Palette,   color: 'text-indigo-600', bg: 'bg-indigo-50',  activeBg: 'bg-indigo-600' },
    { id: 'text',     label: 'المحتوى',   icon: Type,      color: 'text-emerald-600',bg: 'bg-emerald-50', activeBg: 'bg-emerald-600' },
    { id: 'media',    label: 'الوسائط',   icon: ImageIcon, color: 'text-rose-600',   bg: 'bg-rose-50',    activeBg: 'bg-rose-600',   badge: (config.videos || []).length },
    { id: 'products', label: 'المنتجات',  icon: Box,       color: 'text-amber-600',  bg: 'bg-amber-50',   activeBg: 'bg-amber-600',  badge: (config.products || []).length },
    { id: 'sections', label: 'الأقسام',   icon: Layers,    color: 'text-purple-600', bg: 'bg-purple-50',  activeBg: 'bg-purple-600' },
    { id: 'contact',  label: 'التواصل',   icon: Phone,     color: 'text-teal-600',   bg: 'bg-teal-50',    activeBg: 'bg-teal-600' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-center space-y-6">
          <div className="relative mx-auto w-20 h-20">
            <div className="w-20 h-20 rounded-2xl animate-pulse" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}88)` }} />
            <Loader2 size={28} className="absolute inset-0 m-auto text-white animate-spin" />
          </div>
          <div className="space-y-1">
            <p className="font-black text-slate-700 text-lg">جاري التحميل...</p>
            <p className="text-slate-400 text-sm font-medium">يرجى الانتظار</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } } .tab-content { animation: fadeIn 0.25s ease; }`}</style>

      {isSidebarOpen && <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm xl:hidden transition-opacity" onClick={() => setIsSidebarOpen(false)} />}

      {/* TOP BAR */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsSidebarOpen(true)} className="xl:hidden w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-all shrink-0"><Eye size={18} /></button>
              <button onClick={() => setActiveView('dashboard')} className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all shrink-0" title="العودة للوحة التحكم"><ArrowRight size={20} /></button>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md shrink-0" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 4px 12px rgba(${tcRgb}, 0.4)` }}><Globe size={20} /></div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-800 leading-tight">إدارة صفحة الزوار</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {savedAt && <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><Check size={10} className="text-emerald-500" /> آخر حفظ: {savedAt}</span>}
                  {hasChanges && <span className="text-xs text-amber-700 font-bold flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">تغييرات غير محفوظة</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasChanges && <button onClick={handleReset} className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold transition-all"><RotateCcw size={14} /> تراجع</button>}
              <button onClick={handleOpenPreview} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-95"><Eye size={16} /><span className="hidden sm:inline">معاينة حية</span></button>
              <button onClick={handleSave} disabled={saving || !hasChanges} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black shadow-md transition-all ${hasChanges && !saving ? 'text-white hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} style={hasChanges && !saving ? { background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 4px 16px rgba(${tcRgb}, 0.4)` } : {}}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span className="hidden sm:inline">{saving ? 'جاري الحفظ...' : hasChanges ? 'حفظ التغييرات' : 'محفوظ ✓'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid xl:grid-cols-12 gap-6">
          {/* SIDEBAR */}
          <div className={`fixed inset-y-0 right-0 z-[70] w-[280px] sm:w-[320px] bg-slate-50 shadow-2xl transition-transform duration-300 xl:static xl:w-auto xl:bg-transparent xl:shadow-none xl:translate-x-0 xl:z-auto ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'} xl:col-span-3 2xl:col-span-2 flex flex-col`}>
            <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 xl:hidden shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center"><Layout size={16} className="text-indigo-600" /></div>
                <h3 className="font-black text-slate-800 text-sm">أقسام الإدارة</h3>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-500 transition-colors"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto xl:overflow-visible p-4 xl:p-0">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 xl:sticky xl:top-24">
                <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-slate-50 rounded-xl">
                  {[{ label: 'منتج', count: (config.products || []).length, color: 'text-amber-600' }, { label: 'فيديو', count: (config.videos || []).length, color: 'text-rose-600' }, { label: 'رابط', count: (config.customNavLinks || []).length, color: 'text-purple-600' }].map(s => (
                    <div key={s.label} className="text-center">
                      <p className={`text-xl font-black ${s.color}`}>{s.count}</p>
                      <p className="text-[10px] text-slate-400 font-bold">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="h-1.5 rounded-full mb-4 mx-1 transition-all duration-500" style={{ background: `linear-gradient(90deg, ${tc}, ${tc}33)` }} />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 mb-2">الأقسام</p>
                <nav className="space-y-1">
                  {tabs.map(tab => (
                    <button key={tab.id} onClick={() => { setActiveTab(tab.id); if (window.innerWidth < 1280) setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-right ${activeTab === tab.id ? `${tab.bg} ${tab.color} shadow-sm` : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${activeTab === tab.id ? tab.bg : 'bg-slate-100'}`}><tab.icon size={15} className={activeTab === tab.id ? tab.color : 'text-slate-400'} /></div>
                      <span className="flex-1 text-right">{tab.label}</span>
                      {tab.badge !== undefined && tab.badge > 0 && <Badge count={tab.badge} color={activeTab === tab.id ? tab.activeBg : 'bg-slate-400'} />}
                    </button>
                  ))}
                </nav>
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                  <button onClick={handleOpenPreview} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-black transition-all hover:bg-slate-700 active:scale-95"><Eye size={14} /> معاينة</button>
                  {hasChanges && (
                    <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-black transition-all active:scale-95" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)` }}>
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {saving ? 'جاري...' : 'حفظ الآن'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* CONTENT */}
          <div className="xl:col-span-9 2xl:col-span-10 space-y-5 tab-content" key={activeTab}>

            {/* TAB: GENERAL */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                <SectionCard title="اللون الأساسي والهوية البصرية" icon={Palette} iconColor="text-indigo-600" iconBg="bg-indigo-50">
                  <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
                    <div className="space-y-5">
                      <Field label="اللون الرئيسي" hint="سيؤثر على الأزرار والروابط والعناصر البصرية">
                        <div className="flex items-center gap-3">
                          <input type="color" name="themeColor" value={config.themeColor ?? ""} onChange={handleChange} className="w-14 h-11 rounded-xl cursor-pointer border-2 border-slate-200 p-0.5 hover:border-indigo-300 transition-colors" />
                          <Input name="themeColor" value={config.themeColor ?? ""} onChange={handleChange} dir="ltr" placeholder="#4f46e5" />
                        </div>
                      </Field>
                      <div>
                        <p className="text-xs font-bold text-slate-400 mb-3">ألوان جاهزة</p>
                        <div className="grid grid-cols-5 gap-2">
                          {THEME_PRESETS.map(preset => (
                            <button key={preset.color} onClick={() => updateConfig({ themeColor: preset.color })} title={preset.label} className={`relative h-10 rounded-xl border-2 transition-all hover:scale-105 group ${config.themeColor === preset.color ? 'border-slate-800 scale-105 shadow-md' : 'border-transparent hover:border-slate-300'}`} style={{ backgroundColor: preset.color }}>
                              {config.themeColor === preset.color && <Check size={14} className="absolute inset-0 m-auto text-white" />}
                              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{preset.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-4">
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">معاينة اللون</p>
                      <div className="h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${tc}, ${tc}44)` }} />
                      <div className="space-y-2">
                        <button className="w-full py-2.5 rounded-xl text-white text-sm font-bold shadow-md" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 4px 12px rgba(${tcRgb}, 0.4)` }}>زر رئيسي</button>
                        <button className="w-full py-2.5 rounded-xl text-sm font-bold border-2" style={{ borderColor: tc, color: tc, background: `rgba(${tcRgb}, 0.06)` }}>زر ثانوي</button>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {['وسوم', 'أقسام', 'عناوين'].map(l => <span key={l} className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: tc }}>{l}</span>)}
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="اسم الشركة والعلامة التجارية" icon={Hash} iconColor="text-slate-600" iconBg="bg-slate-100">
                  <div className="grid md:grid-cols-2 gap-6">
                    <Field label="اسم الشركة (عربي)" required><Input name="logoTextAr" value={config.logoTextAr ?? ""} onChange={handleChange} placeholder="Kyvzon" /></Field>
                    <Field label="Company Name (English)" required><Input name="logoTextEn" value={config.logoTextEn ?? ""} onChange={handleChange} placeholder="Kyvzon" dir="ltr" /></Field>
                  </div>
                </SectionCard>

                <SectionCard title="شعار الشركة" icon={ImageIcon} iconColor="text-rose-600" iconBg="bg-rose-50">
                  <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
                    <div className="space-y-5">
                      <ImageUpload label="صورة الشعار" value={config.logoUrl ?? ""} onChange={url => updateConfig({ logoUrl: url })} aspectRatio="square" />
                      <Divider label="أو" />
                      <Field label="الرمز الاحتياطي" hint="يظهر إذا لم توجد صورة شعار"><Input name="logoSymbol" value={config.logoSymbol ?? ""} onChange={handleChange} placeholder="◆ ★ ✦" className="text-center text-2xl" /></Field>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-4 bg-slate-50 rounded-2xl p-8 border border-slate-100">
                      {config.logoUrl ? (
                        <img src={config.logoUrl} alt="logo" className="w-24 h-24 object-contain rounded-2xl border border-slate-200 shadow-sm" />
                      ) : (
                        <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-white font-black text-4xl shadow-lg" style={{ background: `linear-gradient(135deg, ${tc}, ${tc}cc)` }}>{config.logoSymbol || '◆'}</div>
                      )}
                      <div className="text-center">
                        <p className="font-black text-slate-800">{config.logoTextAr || 'اسم الشركة'}</p>
                        <p className="text-xs font-semibold" style={{ color: tc }}>Kyvzon Platform</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>
              </div>
            )}

            {/* TAB: TEXT */}
            {activeTab === 'text' && (
              <div className="space-y-5">
                <SectionCard title="القسم الرئيسي (Hero)" icon={Sparkles} iconColor="text-emerald-600" iconBg="bg-emerald-50">
                  <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100"><span className="text-lg">🇸🇦</span><p className="text-sm font-black text-slate-600">المحتوى العربي</p></div>
                      <Field label="العنوان الرئيسي" required><Textarea name="heroTitleAr" value={config.heroTitleAr ?? ""} onChange={handleChange} placeholder="نبني مستقبلاً أكثر صحة..." rows={2} /></Field>
                      <Field label="الوصف"><Textarea name="heroDescAr" value={config.heroDescAr ?? ""} onChange={handleChange} placeholder="وصف مختصر وجذاب..." rows={4} /></Field>
                    </div>
                    <div className="space-y-4" dir="ltr">
                      <div className="flex items-center gap-2 pb-2 border-b border-slate-100"><span className="text-lg">🇬🇧</span><p className="text-sm font-black text-slate-600">English Content</p></div>
                      <Field label="Hero Title" required><Textarea name="heroTitleEn" value={config.heroTitleEn ?? ""} onChange={handleChange} placeholder="Building a healthier future..." rows={2} dir="ltr" /></Field>
                      <Field label="Hero Description"><Textarea name="heroDescEn" value={config.heroDescEn ?? ""} onChange={handleChange} placeholder="Short compelling description..." rows={4} dir="ltr" /></Field>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="قسم من نحن" icon={FileText} iconColor="text-blue-600" iconBg="bg-blue-50" collapsible defaultOpen={false}>
                  <div className="space-y-6">
                    {[1, 2, 3].map(n => (
                      <div key={n}>
                        {n > 1 && <Divider label={`فقرة ${n}`} />}
                        <div className="grid md:grid-cols-2 gap-6 mt-3">
                          <Field label={`الفقرة ${n} (عربي)`}>
                            <Textarea name={`aboutP${n}Ar`} value={(config[`aboutP${n}Ar` as ConfigField] as string) || ''} onChange={handleChange} rows={3} placeholder={`محتوى الفقرة ${n}...`} />
                          </Field>
                          <Field label={`Paragraph ${n} (English)`}>
                            <Textarea name={`aboutP${n}En`} value={(config[`aboutP${n}En` as ConfigField] as string) || ''} onChange={handleChange} rows={3} dir="ltr" placeholder={`About paragraph ${n}...`} />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="العنوان والموقع" icon={MapPin} iconColor="text-rose-600" iconBg="bg-rose-50" collapsible defaultOpen={false}>
                  <div className="grid md:grid-cols-2 gap-6">
                    <Field label="العنوان (عربي)"><Textarea name="addressAr" value={config.addressAr || ''} onChange={handleChange} placeholder="المملكة العربية السعودية، الرياض..." rows={2} /></Field>
                    <Field label="Address (English)"><Textarea name="addressEn" value={config.addressEn || ''} onChange={handleChange} placeholder="Saudi Arabia, Riyadh..." rows={2} dir="ltr" /></Field>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <Field label="رابط خريطة جوجل (Google Maps)" hint="إذا تُرك فارغاً، تُرسم الخريطة تلقائياً من العنوان">
                      <Input name="mapUrl" value={config.mapUrl || ''} onChange={handleChange} placeholder="https://maps.google.com/..." dir="ltr" icon={<MapPin size={14} />} />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard title="قسم التسويق والرؤية" icon={Sparkles} iconColor="text-pink-600" iconBg="bg-pink-50" collapsible defaultOpen={false}>
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <Field label="عنوان القسم (عربي)" required><Input name="marketingTitleAr" value={config.marketingTitleAr || ''} onChange={handleChange} placeholder="التسويق والمبيعات" /></Field>
                      <Field label="Section Title (English)" required><Input name="marketingTitleEn" value={config.marketingTitleEn || ''} onChange={handleChange} placeholder="Marketing & Sales" dir="ltr" /></Field>
                    </div>
                    <Divider label="المقدمة" />
                    <div className="grid md:grid-cols-2 gap-6">
                      <Field label="مقدمة التسويق (عربي)"><Textarea name="marketingIntroAr" value={config.marketingIntroAr || ''} onChange={handleChange} rows={4} placeholder="منذ تأسيسها، تهدف سياسة شركة..." /></Field>
                      <Field label="Marketing Intro (English)"><Textarea name="marketingIntroEn" value={config.marketingIntroEn || ''} onChange={handleChange} rows={4} dir="ltr" placeholder="Since its establishment..." /></Field>
                    </div>
                    <Divider label="الرؤية (Vision)" />
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <Field label="عنوان الرؤية (عربي)"><Input name="marketingVisionTitleAr" value={config.marketingVisionTitleAr || ''} onChange={handleChange} placeholder="رؤيتنا" /></Field>
                        <Field label="نص الرؤية (عربي)"><Textarea name="marketingVisionTextAr" value={config.marketingVisionTextAr || ''} onChange={handleChange} rows={2} placeholder="يسعى سعينا لضمان..." /></Field>
                      </div>
                      <div className="space-y-4" dir="ltr">
                        <Field label="Vision Title (English)"><Input name="marketingVisionTitleEn" value={config.marketingVisionTitleEn || ''} onChange={handleChange} placeholder="Our Vision" dir="ltr" /></Field>
                        <Field label="Vision Text (English)"><Textarea name="marketingVisionTextEn" value={config.marketingVisionTextEn || ''} onChange={handleChange} rows={2} placeholder="We strive to ensure..." dir="ltr" /></Field>
                      </div>
                    </div>
                    <Divider label="الالتزام (Commitment)" />
                    <div className="grid md:grid-cols-2 gap-6">
                      <Field label="رسالة الالتزام (عربي)"><Textarea name="marketingCommitmentAr" value={config.marketingCommitmentAr || ''} onChange={handleChange} rows={2} placeholder="نحن ملتزمون بالعمل..." /></Field>
                      <Field label="Commitment Message (English)"><Textarea name="marketingCommitmentEn" value={config.marketingCommitmentEn || ''} onChange={handleChange} rows={2} dir="ltr" placeholder="We are committed to..." /></Field>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="الإحصائيات (الأرقام)" icon={BarChart3} iconColor="text-orange-600" iconBg="bg-orange-50" collapsible defaultOpen={false}>
                  <div className="space-y-4">
                    {(config.stats || []).map((stat, idx) => (
                      <div key={stat.id} className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-start gap-4">
                        <div className="w-6 h-6 rounded-md bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0">{idx + 1}</div>
                        <div className="flex-1 grid sm:grid-cols-2 gap-3">
                          <Field label="الرقم"><Input type="number" value={stat.value.toString()} onChange={e => updateStat(stat.id, 'value', Number(e.target.value))} /></Field>
                          <Field label="اللاحقة (مثل + أو %)"><Input value={stat.suffix || ''} onChange={e => updateStat(stat.id, 'suffix', e.target.value)} /></Field>
                          <Field label="التسمية (عربي)"><Input value={stat.labelAr} onChange={e => updateStat(stat.id, 'labelAr', e.target.value)} /></Field>
                          <Field label="التسمية (إنجليزي)"><Input value={stat.labelEn} onChange={e => updateStat(stat.id, 'labelEn', e.target.value)} dir="ltr" /></Field>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* TAB: MEDIA */}
            {activeTab === 'media' && (
              <SectionCard title="فيديوهات الموقع" icon={Video} iconColor="text-rose-600" iconBg="bg-rose-50" badge={(config.videos || []).length > 0 && <Badge count={(config.videos || []).length} color="bg-rose-500" />} actions={<button onClick={addVideo} className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-sm font-bold hover:bg-rose-100 transition-all active:scale-95"><Plus size={15} /> إضافة فيديو</button>}>
                <div className="space-y-4">
                  {(config.videos || []).length === 0 ? (
                    <div onClick={addVideo} className="py-20 text-center border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-rose-300 hover:bg-rose-50/30 transition-all group">
                      <Video size={48} className="mx-auto mb-3 text-slate-200 group-hover:text-rose-300 transition-colors" />
                      <p className="font-bold text-slate-400">لا توجد فيديوهات</p>
                      <p className="text-sm text-slate-300 mt-1">اضغط هنا للبدء</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(config.videos || []).map((video, idx) => {
                        const thumb = getYoutubeThumb(video.url);
                        const placement = VIDEO_PLACEMENTS.find(p => p.value === video.placement);
                        return (
                          <div key={video.id} className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between px-5 py-3.5 bg-white border-b border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center text-xs font-black">{idx + 1}</div>
                                {placement && <span className="text-xs font-bold text-slate-500">{placement.emoji} {placement.ar}</span>}
                                {video.autoplay && <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">تلقائي</span>}
                              </div>
                              <button onClick={() => removeVideo(video.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={15} /></button>
                            </div>
                            <div className="p-5">
                              <div className="grid md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-3">
                                  <Field label="رابط YouTube"><Input value={video.url} onChange={e => updateVideo(video.id, 'url', e.target.value)} placeholder="https://www.youtube.com/watch?v=..." dir="ltr" icon={<Play size={13} />} /></Field>
                                  <Field label="مكان العرض">
                                    <select value={video.placement} onChange={e => updateVideo(video.id, 'placement', e.target.value)} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-400 transition-all">
                                      {VIDEO_PLACEMENTS.map(p => <option key={p.value} value={p.value}>{p.emoji} {p.ar} / {p.en}</option>)}
                                    </select>
                                  </Field>
                                  <Toggle checked={video.autoplay} onChange={val => updateVideo(video.id, 'autoplay', val)} label="تشغيل تلقائي" desc="يبدأ الفيديو عند تحميل الصفحة" />
                                </div>
                                <div>
                                  {thumb ? (
                                    <div className="relative rounded-xl overflow-hidden border border-slate-200">
                                      <img src={thumb} alt="thumb" className="w-full aspect-video object-cover" />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/20"><div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-lg"><Play size={16} className="text-white" fill="white" /></div></div>
                                    </div>
                                  ) : (
                                    <div className="w-full aspect-video rounded-xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center"><div className="text-center"><Video size={24} className="mx-auto mb-1 text-slate-300" /><p className="text-xs text-slate-400">معاينة</p></div></div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {/* TAB: PRODUCTS */}
            {activeTab === 'products' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white border border-amber-200 rounded-2xl p-4 text-center"><p className="text-3xl font-black text-amber-600">{(config.products || []).length}</p><p className="text-xs text-slate-500 font-bold mt-1">إجمالي المنتجات</p></div>
                  <div className="bg-white border border-emerald-200 rounded-2xl p-4 text-center"><p className="text-3xl font-black text-emerald-600">{allCategories.length}</p><p className="text-xs text-slate-500 font-bold mt-1">التصنيفات</p></div>
                  <div className="bg-white border border-blue-200 rounded-2xl p-4 text-center"><p className="text-3xl font-black text-blue-600">{(config.products || []).filter(p => p.imageUrl).length}</p><p className="text-xs text-slate-500 font-bold mt-1">لديها صور</p></div>
                  <div className="bg-white border border-rose-200 rounded-2xl p-4 text-center"><p className="text-3xl font-black text-rose-600">{(config.products || []).filter(p => !p.detailsAr).length}</p><p className="text-xs text-slate-500 font-bold mt-1">بدون تفاصيل</p></div>
                </div>
                <SectionCard title="إدارة المنتجات" icon={Box} iconColor="text-amber-600" iconBg="bg-amber-50" badge={(config.products || []).length > 0 && <Badge count={(config.products || []).length} color="bg-amber-500" />} actions={<button onClick={addProduct} className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-sm font-bold hover:bg-amber-100 transition-all active:scale-95"><Plus size={15} /> إضافة منتج</button>}>
                  <div className="space-y-4">
                    {(config.products || []).length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-slate-100">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="بحث في المنتجات..." className="w-full pr-9 pl-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 transition-all" />
                        </div>
                        {allCategories.length > 0 && (
                          <select value={productFilter} onChange={e => setProductFilter(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-amber-400 transition-all">
                            <option value="all">كل التصنيفات</option>
                            {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        )}
                        <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
                          {[{ v: 'grid' as const, icon: Grid }, { v: 'list' as const, icon: List }].map(({ v, icon: Icon }) => (
                            <button key={v} onClick={() => setProductView(v)} className={`p-2 rounded-lg transition-all ${productView === v ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><Icon size={15} /></button>
                          ))}
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{filteredProducts.length} من {(config.products || []).length}</span>
                      </div>
                    )}
                    {(config.products || []).length === 0 ? (
                      <div onClick={addProduct} className="py-24 text-center border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-amber-300 hover:bg-amber-50/30 transition-all group">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4 group-hover:bg-amber-100 transition-colors"><Package size={32} className="text-amber-300 group-hover:text-amber-400 transition-colors" /></div>
                        <p className="font-black text-slate-500 text-lg">لا توجد منتجات بعد</p>
                        <p className="text-slate-400 mt-1 text-sm">اضغط هنا أو على "إضافة منتج" للبدء</p>
                        <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold"><Plus size={15} /> إضافة أول منتج</div>
                      </div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="py-12 text-center"><Search size={32} className="mx-auto mb-2 text-slate-200" /><p className="font-bold text-slate-400 text-sm">لا توجد نتائج</p></div>
                    ) : (
                      <div className={productView === 'grid' ? 'grid md:grid-cols-2 xl:grid-cols-3 gap-4' : 'space-y-4'}>
                        {filteredProducts.map((product, idx) => (
                          <ProductCard key={product.id} product={product} idx={idx} onUpdate={updateProduct} onRemove={removeProduct} onDuplicate={duplicateProduct} onMove={moveProduct} isLast={idx === filteredProducts.length - 1} view={productView} />
                        ))}
                      </div>
                    )}
                    {(config.products || []).length > 0 && (
                      <button onClick={addProduct} className="w-full py-3 border-2 border-dashed border-amber-200 text-amber-600 rounded-2xl text-sm font-bold hover:bg-amber-50 hover:border-amber-300 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"><Plus size={16} /> إضافة منتج جديد</button>
                    )}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* TAB: SECTIONS */}
            {activeTab === 'sections' && (
              <div className="space-y-5">
                <SectionCard title="الأقسام الاختيارية" icon={Layers} iconColor="text-purple-600" iconBg="bg-purple-50">
                  <div className="space-y-3">
                    <Toggle checked={!!config.showCareSection} onChange={val => updateConfig({ showCareSection: val })} label='قسم "رعاية المرضى"' desc="يظهر قسماً خاصاً ببرامج دعم ورعاية المرضى" color="bg-purple-500" />
                    <Toggle checked={!!config.showAgentsSection} onChange={val => updateConfig({ showAgentsSection: val })} label='قسم "شبكة الوكلاء"' desc="يظهر قسماً خاصاً بالوكلاء والموزعين المعتمدين" color="bg-purple-500" />
                    <Toggle checked={!!config.showMarketingSection} onChange={val => updateConfig({ showMarketingSection: val })} label='قسم "التسويق والرؤية"' desc="يظهر قسماً خاصاً بالتسويق والمبيعات ورؤية الشركة" color="bg-purple-500" />
                    <Toggle checked={!!config.showStatsSection} onChange={val => updateConfig({ showStatsSection: val })} label='قسم "الإحصائيات"' desc="يظهر شريط الإحصائيات والأرقام الخاصة بالشركة" color="bg-purple-500" />
                    <Toggle checked={config.showLocationSection !== false} onChange={val => updateConfig({ showLocationSection: val })} label='قسم "الموقع والعنوان"' desc="يظهر قسماً خاصاً بعنوان الشركة وخريطة الوصول" color="bg-purple-500" />
                  </div>
                </SectionCard>

                <SectionCard title="روابط التنقل الإضافية" icon={Link2} iconColor="text-blue-600" iconBg="bg-blue-50" badge={(config.customNavLinks || []).length > 0 && <Badge count={(config.customNavLinks || []).length} color="bg-blue-500" />} actions={<button onClick={addNavLink} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-sm font-bold hover:bg-blue-100 transition-all active:scale-95"><Plus size={15} /> إضافة رابط</button>}>
                  <div className="space-y-4">
                    {(config.customNavLinks || []).length === 0 ? (
                      <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl"><Link2 size={40} className="mx-auto mb-3 text-slate-200" /><p className="font-bold text-slate-400">لا توجد روابط إضافية</p></div>
                    ) : (
                      <div className="space-y-3">
                        {(config.customNavLinks || []).map((link, idx) => (
                          <div key={link.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-black text-slate-400 flex items-center gap-1"><GripVertical size={12} /> رابط {idx + 1}</span>
                              <button onClick={() => removeNavLink(link.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={14} /></button>
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3 mb-3">
                              <input value={link.labelAr} onChange={e => updateNavLink(link.id, 'labelAr', e.target.value)} placeholder="الاسم عربي" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-blue-400 transition-all" />
                              <input value={link.labelEn} onChange={e => updateNavLink(link.id, 'labelEn', e.target.value)} placeholder="English Label" dir="ltr" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-blue-400 transition-all" />
                            </div>
                            <div className="flex gap-2">
                              <input value={link.url} onChange={e => updateNavLink(link.id, 'url', e.target.value)} placeholder="https://..." dir="ltr" className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-blue-400 transition-all" />
                              <a href={link.url} target="_blank" rel="noopener noreferrer" className="p-2 bg-slate-100 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"><ExternalLink size={14} /></a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="إدارة الوكلاء" icon={Users} iconColor="text-emerald-600" iconBg="bg-emerald-50" badge={(config.agents || []).length > 0 && <Badge count={(config.agents || []).length} color="bg-emerald-500" />} actions={<button onClick={addAgent} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all active:scale-95"><Plus size={15} /> إضافة وكيل</button>}>
                  <div className="space-y-4">
                    {(config.agents || []).length === 0 ? (
                      <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl"><Users size={40} className="mx-auto mb-3 text-slate-200" /><p className="font-bold text-slate-400">لا توجد شعارات وكلاء</p></div>
                    ) : (
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(config.agents || []).map((agent, idx) => (
                          <div key={agent.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-black text-slate-400 flex items-center gap-1"><GripVertical size={12} /> وكيل {idx + 1}</span>
                              <button onClick={() => removeAgent(agent.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"><Trash2 size={14} /></button>
                            </div>
                            <div className="space-y-3">
                              <input value={agent.name} onChange={e => updateAgent(agent.id, 'name', e.target.value)} placeholder="اسم الوكيل" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-400 transition-all" />
                              <textarea value={agent.details || ''} onChange={e => updateAgent(agent.id, 'details', e.target.value)} placeholder="تفاصيل ووصف الوكيل..." rows={2} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-400 transition-all resize-none" />
                              <input value={agent.websiteUrl || ''} onChange={e => updateAgent(agent.id, 'websiteUrl', e.target.value)} placeholder="رابط الموقع الإلكتروني" dir="ltr" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-400 transition-all text-left" />
                              <input value={agent.mapUrl || ''} onChange={e => updateAgent(agent.id, 'mapUrl', e.target.value)} placeholder="عنوان الوكيل أو إحداثياته" dir="ltr" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-400 transition-all text-left" />
                              <ImageUpload label="شعار الوكيل" value={agent.logoUrl || ''} onChange={url => updateAgent(agent.id, 'logoUrl', url)} aspectRatio="landscape" compact />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* TAB: CONTACT */}
            {activeTab === 'contact' && (
              <div className="space-y-5">
                <SectionCard title="معلومات التواصل" icon={Phone} iconColor="text-teal-600" iconBg="bg-teal-50">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <Field label="رقم الهاتف"><Input name="phone" value={config.phone || ''} onChange={handleChange} placeholder="+966 50 000 0000" dir="ltr" icon={<Phone size={14} />} /></Field>
                    <Field label="البريد الإلكتروني"><Input name="email" value={config.email || ''} onChange={handleChange} placeholder="info@company.com" type="email" dir="ltr" icon={<Mail size={14} />} /></Field>
                  </div>
                </SectionCard>
                <SectionCard title="روابط التواصل الاجتماعي" icon={Globe} iconColor="text-blue-600" iconBg="bg-blue-50">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {([
                      { key: 'facebook' as const,  icon: Facebook,  label: 'Facebook',  color: 'text-blue-600',  bg: 'bg-blue-50' },
                      { key: 'twitter' as const,   icon: Twitter,   label: 'Twitter/X', color: 'text-sky-500',   bg: 'bg-sky-50' },
                      { key: 'linkedin' as const,  icon: Linkedin,  label: 'LinkedIn',  color: 'text-blue-700',  bg: 'bg-blue-50' },
                      { key: 'instagram' as const, icon: Instagram, label: 'Instagram', color: 'text-pink-600',  bg: 'bg-pink-50' },
                      { key: 'youtube' as const,   icon: Youtube,   label: 'YouTube',   color: 'text-red-600',   bg: 'bg-red-50' },
                    ]).map(social => {
                      const socialLinks = config.socialLinks || {};
                      const SocialIcon = social.icon;
                      return (
                        <div key={social.key} className="space-y-1.5">
                          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${social.bg}`}><SocialIcon size={13} className={social.color} /></div>
                            {social.label}
                          </label>
                          <Input value={socialLinks[social.key] || ''} onChange={e => updateConfig({ socialLinks: { ...socialLinks, [social.key]: e.target.value } })} placeholder={`https://${social.key}.com/...`} dir="ltr" />
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* Bottom Save Bar */}
            <div className="flex items-center justify-between py-4 px-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <p className="text-sm text-slate-500 font-medium">{hasChanges ? '⚠️ تغييرات غير محفوظة' : savedAt ? `✓ آخر حفظ: ${savedAt}` : 'لا توجد تغييرات'}</p>
              <div className="flex gap-2">
                <button onClick={handleOpenPreview} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all"><Eye size={15} /> معاينة</button>
                <button onClick={handleSave} disabled={saving || !hasChanges} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black transition-all ${hasChanges && !saving ? 'text-white shadow-lg hover:-translate-y-0.5' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} style={hasChanges && !saving ? { background: `linear-gradient(135deg, ${tc}, ${tc}cc)`, boxShadow: `0 4px 20px rgba(${tcRgb}, 0.4)` } : {}}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'جاري الحفظ...' : hasChanges ? 'حفظ الكل' : 'محفوظ ✓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
