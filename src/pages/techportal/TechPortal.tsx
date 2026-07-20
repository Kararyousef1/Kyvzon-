/**
 * ════════════════════════════════════════════════════════════════
 *  TechPortal — Layout للبوابة التقنية (Responsive Hardened)
 *
 *  🎯 الأهداف:
 *   - خلفية داكنة (slate-950) تملأ كامل منطقة المحتوى على كل الشاشات
 *     دون ظهور حواف فاتحة (يُلغى padding الموروث من AppLayout).
 *   - حاوية داخلية متجاوبة بحد أقصى للعرض على الشاشات العريضة جداً
 *     (يمنع تمدّد المحتوى بلا نهاية على 2K/4K/ultrawide).
 *   - padding متدرّج: مريح على الموبايل، أوسع على الديسكتوب.
 *   - الشريط الجانبي والتنقل عبر Sidebar.tsx المشترك.
 * ════════════════════════════════════════════════════════════════
 */

import { Suspense, type FC } from 'react';
import { Outlet } from 'react-router-dom';

const PageLoader: FC = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
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
    /*
     * -m-4 sm:-m-6  → يُلغي padding الحاوية الأب (AppLayout: p-4 sm:p-6)
     *                 حتى تمتدّ الخلفية الداكنة إلى حواف منطقة المحتوى.
     * min-h-[calc(100vh-4rem)] → يملأ الارتفاع المتبقي أسفل الـ Header (h-16).
     */
    <div
      dir="rtl"
      className="-m-4 sm:-m-6 bg-slate-950 min-h-[calc(100vh-4rem)]"
    >
      {/* حاوية داخلية متجاوبة: padding متدرّج + حد أقصى للعرض + توسيط */}
      <div className="w-full max-w-[1600px] mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
