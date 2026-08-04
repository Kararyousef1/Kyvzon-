import { useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Gavel,
  Layers,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type ProcurementUnitKey =
  | 'main' | 'foundation' | 'requisitions' | 'suppliers' | 'sourcing'
  | 'orders' | 'invoices' | 'contracts' | 'analytics';

type Item = { title: string; subtitle: string; to: string; icon: LucideIcon };

// ─── لوحة ألوان المشتريات: كهرماني، أزرق، أخضر، بنفسجي، فولاذي، عنابي ───
const themes = [
  { grad: 'from-[#78350f] to-[#d97706]', bar: 'bg-[#d97706]', num: 'text-[#b45309]' },
  { grad: 'from-[#1e3a5f] to-[#2563eb]', bar: 'bg-[#2563eb]', num: 'text-[#1d4ed8]' },
  { grad: 'from-[#064e3b] to-[#059669]', bar: 'bg-[#059669]', num: 'text-[#047857]' },
  { grad: 'from-[#312e81] to-[#7c3aed]', bar: 'bg-[#7c3aed]', num: 'text-[#6d28d9]' },
  { grad: 'from-[#0c4a6e] to-[#0891b2]', bar: 'bg-[#0891b2]', num: 'text-[#0e7490]' },
  { grad: 'from-[#881337] to-[#e11d48]', bar: 'bg-[#e11d48]', num: 'text-[#be123c]' },
] as const;

const units: Record<ProcurementUnitKey, { title: string; subtitle: string; items: Item[] }> = {
  // ── مدخل البوابة ──
  main: { title: 'بوابة المشتريات', subtitle: 'انتقل بين وحدات المشتريات', items: [
    { title: 'الأساس والتحكم', subtitle: 'الفئات والقواعد', to: '/app/procurement/foundation', icon: Settings },
    { title: 'طلبات الشراء', subtitle: 'PR والموافقات', to: '/app/procurement/requisitions', icon: ClipboardList },
    { title: 'الموردون', subtitle: 'التأهيل والتقييم', to: '/app/procurement/suppliers', icon: Users },
    { title: 'التوريد الاستراتيجي', subtitle: 'RFx والمزادات', to: '/app/procurement/sourcing', icon: Gavel },
    { title: 'أوامر الشراء', subtitle: 'PO والاستلام', to: '/app/procurement/orders', icon: ShoppingCart },
    { title: 'الفواتير', subtitle: 'المطابقة الثلاثية', to: '/app/procurement/invoices', icon: Receipt },
    { title: 'العقود', subtitle: 'CLM', to: '/app/procurement/contracts', icon: FileText },
    { title: 'تحليل الإنفاق', subtitle: 'الذكاء والتنبؤ', to: '/app/procurement/analytics', icon: BarChart3 },
  ]},

  // ── 00 الأساس والتحكم ──
  foundation: { title: 'الأساس والتحكم', subtitle: 'فئات الإنفاق، قواعد الموافقة، السياسات، سجل التدقيق', items: [
    { title: 'لوحة الأساس', subtitle: 'المؤشرات والفحص', to: '/app/procurement/foundation', icon: Settings },
    { title: 'فئات الإنفاق', subtitle: 'شجرة UNSPSC', to: '/app/procurement/foundation/categories', icon: Layers },
    { title: 'قواعد الموافقة', subtitle: 'مستويات الاعتماد', to: '/app/procurement/foundation/approval-rules', icon: ShieldCheck },
    { title: 'سياسات المشتريات', subtitle: 'العتبات والضوابط', to: '/app/procurement/foundation/policies', icon: FileText },
    { title: 'سجل التدقيق', subtitle: 'كل التغييرات', to: '/app/procurement/foundation/audit', icon: ClipboardList },
    { title: 'صحة التكامل', subtitle: 'المخزون والمالية', to: '/app/procurement/foundation/integration', icon: TrendingUp },
  ]},

  // ── 01 طلبات الشراء ──
  requisitions: { title: 'طلبات الشراء', subtitle: 'الإنشاء، الموافقات، فحص الميزانية', items: [
    { title: 'طلبات الشراء', subtitle: 'القائمة والحالات', to: '/app/procurement/requisitions', icon: ClipboardList },
  ]},

  // ── 02 الموردون ──
  suppliers: { title: 'الموردون والتأهيل', subtitle: 'التسجيل، التأهيل، التقييم، الوثائق', items: [
    { title: 'الموردون', subtitle: 'السجل والتأهيل', to: '/app/procurement/suppliers', icon: Users },
  ]},

  // ── 03 التوريد الاستراتيجي ──
  sourcing: { title: 'التوريد الاستراتيجي', subtitle: 'RFI / RFQ / RFP والمزادات العكسية', items: [
    { title: 'أحداث التوريد', subtitle: 'RFx', to: '/app/procurement/sourcing', icon: Gavel },
    { title: 'المزاد المباشر', subtitle: 'Live Auction', to: '/app/procurement/sourcing/auctions/live', icon: TrendingUp },
  ]},

  // ── 04 أوامر الشراء والاستلام ──
  orders: { title: 'أوامر الشراء والاستلام', subtitle: 'PO، الإصدارات، استلام البضائع', items: [
    { title: 'أوامر الشراء', subtitle: 'PO', to: '/app/procurement/orders/purchase-orders', icon: ShoppingCart },
    { title: 'الإصدارات', subtitle: 'PO Releases', to: '/app/procurement/orders/releases', icon: CalendarClock },
    { title: 'استلام البضائع', subtitle: 'GR', to: '/app/procurement/orders/goods-receipts', icon: Package },
  ]},

  // ── 05 الفواتير والمطابقة ──
  invoices: { title: 'الفواتير والمطابقة الثلاثية', subtitle: 'المطابقة، حدود التسامح، الاستثناءات', items: [
    { title: 'الفواتير', subtitle: 'قائمة الفواتير', to: '/app/procurement/invoices', icon: Receipt },
    { title: 'حدود التسامح', subtitle: 'Tolerance Rules', to: '/app/procurement/invoices/tolerance-rules', icon: ShieldCheck },
  ]},

  // ── 06 العقود ──
  contracts: { title: 'إدارة دورة حياة العقود', subtitle: 'القوالب، الإصدارات، الالتزامات، التواقيع', items: [
    { title: 'العقود', subtitle: 'السجل', to: '/app/procurement/contracts', icon: FileText },
    { title: 'القوالب', subtitle: 'Templates', to: '/app/procurement/contracts/templates', icon: Layers },
    { title: 'الالتزامات', subtitle: 'Obligations', to: '/app/procurement/contracts/obligations', icon: CalendarClock },
    { title: 'الإصدارات', subtitle: 'Versions', to: '/app/procurement/contracts/versions', icon: ClipboardList },
    { title: 'التواقيع', subtitle: 'Signatures', to: '/app/procurement/contracts/signatures', icon: ShieldCheck },
  ]},

  // ── 07 تحليل الإنفاق ──
  analytics: { title: 'تحليل الإنفاق وذكاء المشتريات', subtitle: 'الإنفاق، الفئات، اتجاه الأسعار، التنبؤ', items: [
    { title: 'تحليل الإنفاق', subtitle: 'Spend Analytics', to: '/app/procurement/analytics', icon: BarChart3 },
    { title: 'الفئات', subtitle: 'Categories', to: '/app/procurement/analytics/categories', icon: Layers },
    { title: 'اتجاه الأسعار', subtitle: 'Price Trend', to: '/app/procurement/analytics/price-trend', icon: TrendingUp },
    { title: 'التنبؤ', subtitle: 'Forecast', to: '/app/procurement/analytics/forecast', icon: Building2 },
  ]},
};

export function ProcurementUnitNav({ unit }: { unit: ProcurementUnitKey }) {
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
      {/* ══════════ الرأس ══════════ */}
      <div className="px-5 pt-4 pb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-[#78350f] to-[#d97706]"
            style={{ boxShadow: '0 2px 8px rgba(120,53,15,0.30)' }}
          >
            <ShoppingCart size={17} strokeWidth={1.75} className="text-white" aria-hidden="true" />
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
            Procure to Pay
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

      {/* ══════════ البطاقات ══════════ */}
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
                  className="group relative flex flex-col w-44 rounded-xl p-3.5 gap-3 select-none bg-white border border-slate-200 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
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

      {/* ══════════ تلميح السحب ══════════ */}
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
