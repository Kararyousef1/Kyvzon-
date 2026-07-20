/**
 * ════════════════════════════════════════════════════════════════
 *  TechPortal — Layout للبوابة التقنية
 *
 *  يوفر الخلفية الداكنة (bg-slate-950) المتسقة مع تصميم
 *  البوابة التقنية السابق.
 *  الشريط الجانبي والتنقل يتم عبر الشريط الرئيسي (Sidebar.tsx)
 * ════════════════════════════════════════════════════════════════
 */

import { Suspense, type FC } from 'react';
import { Outlet } from 'react-router-dom';

const PageLoader: FC = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-cyan-900 border-t-cyan-400 animate-spin" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent border-b-blue-500 animate-spin animation-delay-150" />
      </div>
      <p className="text-sm text-slate-500 font-medium">جاري التحميل...</p>
    </div>
  </div>
);

export default function TechPortal() {
  return (
    <div className="min-h-full bg-slate-950" dir="rtl">
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </div>
  );
}