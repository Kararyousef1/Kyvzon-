import { useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  FileText,
  History,
  Fuel,
  MapPin,
  Navigation,
  Package,
  QrCode,
  Radio,
  Send,
  Settings,
  ShieldAlert,
  Sliders,
  Truck,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type MovementUnitKey =
  | 'employee_main'
  | 'employee_foundation'
  | 'employee_permits'
  | 'employee_execution'
  | 'employee_field_visits'
  | 'employee_missions'
  | 'employee_compliance'
  | 'employee_analytics'
  | 'logistics_main'
  | 'logistics_foundation'
  | 'logistics_fleet'
  | 'logistics_drivers'
  | 'logistics_maintenance'
  | 'logistics_fuel'
  | 'logistics_orders'
  | 'logistics_routes'
  | 'logistics_dispatch'
  | 'logistics_tracking'
  | 'logistics_epod'
  | 'logistics_carriers'
  | 'logistics_costs';

type Item = { title: string; subtitle: string; to: string; icon: LucideIcon };

const themes = [
  { grad: 'from-[#1e3a8a] to-[#3b82f6]', bar: 'bg-[#3b82f6]', num: 'text-[#1d4ed8]' },
  { grad: 'from-[#065f46] to-[#10b981]', bar: 'bg-[#10b981]', num: 'text-[#047857]' },
  { grad: 'from-[#7c2d12] to-[#f97316]', bar: 'bg-[#f97316]', num: 'text-[#c2410c]' },
  { grad: 'from-[#581c87] to-[#8b5cf6]', bar: 'bg-[#8b5cf6]', num: 'text-[#7c3aed]' },
  { grad: 'from-[#0f172a] to-[#475569]', bar: 'bg-[#475569]', num: 'text-[#334155]' },
  { grad: 'from-[#831843] to-[#ec4899]', bar: 'bg-[#ec4899]', num: 'text-[#be185d]' },
] as const;

const units: Record<MovementUnitKey, { title: string; subtitle: string; items: Item[] }> = {
  // ── الدور أ: حركة الموظفين ──
  employee_main: { title: 'بوابة حركة الموظفين', subtitle: 'نظرة عامة ووحدات حركة الموظفين والتصاريح', items: [
    { title: 'الأساس والسياسات', subtitle: 'E00 • الإعدادات', to: '/app/movement/employee/policies', icon: Sliders },
    { title: 'تصاريح الخروج', subtitle: 'E01 • QR والأمان', to: '/app/movement/employee/permits', icon: QrCode },
    { title: 'تنفيذ البوابة', subtitle: 'E02 • الحراسة', to: '/app/movement/employee/execution', icon: Navigation },
    { title: 'الزيارات الميدانية', subtitle: 'E03 • المتابعة', to: '/app/movement/employee/field-visits', icon: Briefcase },
    { title: 'المهام والانتدابات', subtitle: 'E04 • السفر والبدلات', to: '/app/movement/employee/missions', icon: CalendarClock },
    { title: 'الامتثال والمخالفات', subtitle: 'E05 • الرصد', to: '/app/movement/employee/compliance', icon: ShieldAlert },
    { title: 'التحليلات والتقارير', subtitle: 'E06 • المؤشرات', to: '/app/movement/employee/analytics', icon: BarChart3 },
  ]},
  employee_foundation: { title: 'الأساس والسياسات', subtitle: 'E00 • سياسات الخروج ومواقع التفتيش', items: [
    { title: 'سياسات الخروج', subtitle: 'المدة والقيود', to: '/app/movement/employee/policies', icon: Sliders },
    { title: 'المواقع والبوابات', subtitle: 'النقاط الجغرافية', to: '/app/movement/employee/locations', icon: MapPin },
  ]},
  employee_permits: { title: 'تصاريح الخروج المسبقة', subtitle: 'E01 • إصدار التصاريح وتأمين QR', items: [
    { title: 'قائمة التصاريح', subtitle: 'إدارة التصاريح', to: '/app/movement/employee/permits', icon: QrCode },
  ]},
  employee_execution: { title: 'تنفيذ الحركة والبوابة', subtitle: 'E02 • مسح الباركود والعودة والتأخير', items: [
    { title: 'شاشة البوابة', subtitle: 'مسح الحركات', to: '/app/movement/employee/execution', icon: Navigation },
  ]},
  employee_field_visits: { title: 'الزيارات الميدانية', subtitle: 'E03 • متابعة العملاء والمواقع', items: [
    { title: 'الزيارات الميدانية', subtitle: 'سجل الزيارات', to: '/app/movement/employee/field-visits', icon: Briefcase },
  ]},
  employee_missions: { title: 'المهام والانتدابات', subtitle: 'E04 • السفر والبدلات الرسمية', items: [
    { title: 'الانتدابات', subtitle: 'سجل المهام', to: '/app/movement/employee/missions', icon: CalendarClock },
  ]},
  employee_compliance: { title: 'الامتثال والمخالفات', subtitle: 'E05 • رصد التأخير وانحرافات المسار', items: [
    { title: 'المخالفات المرصودة', subtitle: 'المتابعة', to: '/app/movement/employee/compliance', icon: ShieldAlert },
  ]},
  employee_analytics: { title: 'التحليلات والتقارير', subtitle: 'E06 • مؤشرات الأداء وحركة الموظفين', items: [
    { title: 'التحليلات', subtitle: 'التقارير الشاملة', to: '/app/movement/employee/analytics', icon: BarChart3 },
  ]},

  // ── الدور ب: الحركة واللوجستيات ──
  logistics_main: { title: 'بوابة الحركة واللوجستيات', subtitle: 'نظرة عامة على الأسطول والشحنات والعمليات اللوجستية', items: [
    { title: 'الأساس ولوحة القيادة', subtitle: 'L00 • برج المراقبة', to: '/app/movement/logistics/dashboard', icon: Zap },
    { title: 'الأسطول والمركبات', subtitle: 'L01 • الجاهزية', to: '/app/movement/logistics/fleet', icon: Truck },
    { title: 'السائقون والامتثال', subtitle: 'L02 • HOS والسلامة', to: '/app/movement/logistics/drivers', icon: Users },
    { title: 'امتثال السلامة', subtitle: 'L13 • HOS و DVIR', to: '/app/movement/logistics/safety', icon: ShieldAlert },
    { title: 'الصيانة والإصلاح', subtitle: 'L03 • جداول الصيانة', to: '/app/movement/logistics/maintenance', icon: Wrench },
    { title: 'الوقود والطاقة', subtitle: 'L04 • الاستهلاك', to: '/app/movement/logistics/fuel', icon: Fuel },
    { title: 'أوامر النقل والشحنات', subtitle: 'L05 • الحمولة', to: '/app/movement/logistics/orders', icon: Package },
    { title: 'تخطيط المسارات', subtitle: 'L06 • التحسين', to: '/app/movement/logistics/routes', icon: Compass },
    { title: 'الإرسال والتنفيذ', subtitle: 'L07 • تسيير الرحلات', to: '/app/movement/logistics/dispatch', icon: Send },
    { title: 'التتبع والرؤية الحية', subtitle: 'L08 • تتبع GPS', to: '/app/movement/logistics/tracking', icon: Radio },
    { title: 'التسليم وإثباته', subtitle: 'L09 • EPOD', to: '/app/movement/logistics/epod', icon: FileText },
    { title: 'الناقلون والتعاقد', subtitle: 'L10 • 3PL', to: '/app/movement/logistics/carriers', icon: Users },
    { title: 'التكاليف والتحليلات', subtitle: 'L11 • الأرباح', to: '/app/movement/logistics/costs', icon: BarChart3 },
    { title: 'إعادة تشغيل المسار', subtitle: 'L12 • تحقيق الحوادث', to: '/app/movement/logistics/track-replay', icon: History },
  ]},
  logistics_foundation: { title: 'الأساس ولوحة القيادة', subtitle: 'L00 • إعدادات البنية والتحكم', items: [
    { title: 'لوحة القيادة', subtitle: 'برج المراقبة', to: '/app/movement/logistics/dashboard', icon: Zap },
    { title: 'الإعدادات الأساسية', subtitle: 'التكوين', to: '/app/movement/logistics/foundation', icon: Settings },
  ]},
  logistics_fleet: { title: 'إدارة الأسطول والمركبات', subtitle: 'L01 • الشاحنات والسعة والوثائق', items: [
    { title: 'الأسطول', subtitle: 'المركبات', to: '/app/movement/logistics/fleet', icon: Truck },
  ]},
  logistics_drivers: { title: 'السائقون والامتثال', subtitle: 'L02 • الرخص وساعات القيادة HOS', items: [
    { title: 'السائقون', subtitle: 'الامتثال', to: '/app/movement/logistics/drivers', icon: Users },
    { title: 'امتثال السلامة', subtitle: 'HOS و DVIR', to: '/app/movement/logistics/safety', icon: ShieldAlert },
  ]},
  logistics_maintenance: { title: 'الصيانة والإصلاح', subtitle: 'L03 • الصيانة الوقائية والطارئة', items: [
    { title: 'الصيانة', subtitle: 'سجلات الإصلاح', to: '/app/movement/logistics/maintenance', icon: Wrench },
  ]},
  logistics_fuel: { title: 'الوقود والطاقة', subtitle: 'L04 • تعبئة الوقود وكشف الاحتيال', items: [
    { title: 'الوقود', subtitle: 'سجلات التعبئة', to: '/app/movement/logistics/fuel', icon: Fuel },
  ]},
  logistics_orders: { title: 'أوامر النقل والشحنات', subtitle: 'L05 • أوامر الشحن والحمولة', items: [
    { title: 'أوامر النقل', subtitle: 'الشحنات', to: '/app/movement/logistics/orders', icon: Package },
  ]},
  logistics_routes: { title: 'تخطيط المسارات والتحسين', subtitle: 'L06 • خوارزميات المسار', items: [
    { title: 'المسارات', subtitle: 'التخطيط', to: '/app/movement/logistics/routes', icon: Compass },
  ]},
  logistics_dispatch: { title: 'الإرسال والتنفيذ', subtitle: 'L07 • تسيير الرحلات وإسناد السائقين', items: [
    { title: 'الإرسال', subtitle: 'الرحلات', to: '/app/movement/logistics/dispatch', icon: Send },
  ]},
  logistics_tracking: { title: 'التتبع والرؤية الحية', subtitle: 'L08 • إشارات GPS والخريطة الحية', items: [
    { title: 'التتبع الحي', subtitle: 'الرؤية', to: '/app/movement/logistics/tracking', icon: Radio },
    { title: 'إعادة تشغيل المسار', subtitle: 'تحقيق الحوادث', to: '/app/movement/logistics/track-replay', icon: History },
  ]},
  logistics_epod: { title: 'التسليم وإثباته الإلكتروني', subtitle: 'L09 • EPOD والتوقيعات الرقمية', items: [
    { title: 'إثبات التسليم', subtitle: 'EPOD', to: '/app/movement/logistics/epod', icon: FileText },
  ]},
  logistics_carriers: { title: 'الناقلون والتعاقد', subtitle: 'L10 • شركات الشحن الخارجية 3PL', items: [
    { title: 'الناقلون', subtitle: 'التعاقد', to: '/app/movement/logistics/carriers', icon: Users },
  ]},
  logistics_costs: { title: 'التكاليف والتحليلات المالية', subtitle: 'L11 • تكلفة الرحلات وصافي الأرباح', items: [
    { title: 'التكاليف والتحليلات', subtitle: 'المالية', to: '/app/movement/logistics/costs', icon: BarChart3 },
  ]},
};

export function MovementUnitNav({ unit }: { unit: MovementUnitKey }) {
  const meta = units[unit];

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollStart = useRef(0);
  const hasDragged = useRef(false);

  const SCROLL_STEP = 220;

  const scrollTo = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -SCROLL_STEP : SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    hasDragged.current = false;
    startX.current = e.pageX - el.offsetLeft;
    scrollStart.current = el.scrollLeft;
    el.style.cursor = 'grabbing';
    el.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startX.current) * 1.2;
    if (Math.abs(walk) > 4) hasDragged.current = true;
    el.scrollLeft = scrollStart.current - walk;
  }, []);

  const endDrag = useCallback(() => {
    isDragging.current = false;
    const el = scrollRef.current;
    if (!el) return;
    el.style.cursor = 'grab';
    el.style.userSelect = '';
  }, []);

  return (
    <section
      dir="rtl"
      className="mb-6 rounded-2xl overflow-hidden bg-gradient-to-b from-white to-slate-50 border border-slate-200 shadow-sm"
    >
      <div className="px-5 pt-4 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-indigo-900 to-blue-700"
            style={{ boxShadow: '0 2px 8px rgba(30,58,138,0.30)' }}
          >
            <Truck size={17} strokeWidth={1.75} className="text-white" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <h2 className="text-[14px] font-bold leading-tight truncate text-slate-900 tracking-tight">
              {meta.title}
            </h2>
            <p className="text-[11px] mt-0.5 truncate text-slate-400">{meta.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-semibold uppercase px-3 py-1 rounded-full text-slate-500 bg-slate-100 border border-slate-200 tracking-[0.08em]">
            Movement & Logistics
          </span>

          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => scrollTo('right')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="تمرير لليمين"
            >
              <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => scrollTo('left')}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="تمرير لليسار"
            >
              <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto px-5 py-4 finance-nav-scroll cursor-grab"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <div className="min-w-max flex flex-row-reverse items-stretch gap-2">
          {meta.items.map((item, i) => {
            const t = themes[i % themes.length];
            const Icon = item.icon;
            const stepNum = String(i + 1).padStart(2, '0');

            return (
              <div key={item.to} className="flex flex-row-reverse items-center gap-2">
                <Link
                  to={item.to}
                  draggable={false}
                  onClick={e => { if (hasDragged.current) e.preventDefault(); }}
                  className="group relative flex flex-col w-44 rounded-xl p-3.5 gap-3 select-none bg-white border border-slate-200 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                >
                  <div className="flex items-center justify-between">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${t.grad} flex items-center justify-center shadow`}>
                      <Icon size={15} strokeWidth={1.75} className="text-white" aria-hidden="true" />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums opacity-50 ${t.num}`}>
                      {stepNum}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-[12.5px] font-semibold leading-tight truncate text-slate-800">
                      {item.title}
                    </h3>
                    <p className="text-[11px] mt-0.5 truncate text-slate-400">{item.subtitle}</p>
                  </div>

                  <div className={`absolute bottom-0 right-0 left-0 h-[2.5px] rounded-b-xl ${t.bar} opacity-0 group-hover:opacity-100 transition-opacity duration-200`} />
                </Link>

                {i < meta.items.length - 1 && (
                  <div className="flex items-center gap-0.5 shrink-0 text-slate-200" aria-hidden="true">
                    <ArrowLeft size={12} strokeWidth={2} />
                    <ArrowRight size={12} strokeWidth={2} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-3 text-[11px] text-slate-300">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 11V6a2 2 0 00-2-2v0a2 2 0 00-2 2v0M14 10V4a2 2 0 00-2-2v0a2 2 0 00-2 2v2M10 10.5V6a2 2 0 00-2-2v0a2 2 0 00-2 2v8" />
          <path d="M6 14v0a4 4 0 014-4h0" />
          <path d="M18 11a2 2 0 012 2v3a6 6 0 01-6 6H9a6 6 0 01-5.2-3" />
        </svg>
        <span>اسحب يميناً أو يساراً للتنقل</span>
      </div>
    </section>
  );
}
