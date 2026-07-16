/**
 * types.ts — الأنواع المشتركة لصفحة الهبوط الخاصة بـ KYVZON
 * تُبقي كل الأنواع في مكان واحد لسهولة الصيانة وإعادة الاستخدام.
 */
import type { LucideIcon } from 'lucide-react';

/** اللغات الثلاث المدعومة في المنصة */
export type Lang = 'ar' | 'en' | 'ku';

/** نص مترجم لكل لغة مدعومة */
export type LocalizedText = Record<Lang, string>;

/** قائمة نصوص مترجمة (تُستخدم لعناصر Bullet / Features) */
export type LocalizedList = Record<Lang, string[]>;

export interface LandingSignupIntent {
  type: 'plan' | 'service' | 'review' | 'demo' | 'general';
  label?: string;
  planId?: string;
  serviceId?: string;
}

export interface LandingPageProps {
  onLoginClick: () => void;
  /** يُستخدم عند عرض الصفحة كمعاينة مصغّرة (يوقف التشغيل التلقائي للحركات الدورية) */
  previewMode?: boolean;
}

export interface PortalData {
  id: string;
  icon: LucideIcon;
  color: string;
  gradient: string;
  title: LocalizedText;
  desc: LocalizedText;
  features: LocalizedList;
}

export interface PlanFeatureRow {
  id: string;
  label: LocalizedText;
  /** true = متوفرة كاملة، false = غير متوفرة، أو نص مخصص (مثال: "محدود") */
  values: Record<'low' | 'medium' | 'max' | 'extra', boolean | LocalizedText>;
}

export interface PlanData {
  id: 'low' | 'medium' | 'max' | 'extra';
  name: LocalizedText;
  range: LocalizedText;
  desc: LocalizedText;
  features: LocalizedList;
  highlight: boolean;
  badge: LocalizedText | null;
}

export interface ServiceData {
  icon: LucideIcon;
  color: string;
  title: LocalizedText;
  desc: LocalizedText;
  promo: LocalizedText;
  badge: LocalizedText;
}

export interface StatData {
  icon: LucideIcon;
  value: string;
  suffix?: string;
  label: LocalizedText;
}

export interface IndustryData {
  icon: LucideIcon;
  label: LocalizedText;
}

export interface TestimonialData {
  id: string;
  name: string;
  role: LocalizedText;
  quote: LocalizedText;
  rating: number;
  initials: string;
  color: string;
}

export interface FaqItem {
  id: string;
  q: LocalizedText;
  a: LocalizedText;
}

export type ScreenshotId = 'dashboard' | 'hr' | 'employee' | 'analytics' | 'mobile';

export interface ScreenshotTab {
  id: ScreenshotId;
  icon: LucideIcon;
  label: LocalizedText;
  color: string;
}
