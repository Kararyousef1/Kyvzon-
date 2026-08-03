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
  Coins,
  FileText,
  FolderKanban,
  Landmark,
  Layers,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export type FinanceUnitKey =
  | 'main' | 'foundation' | 'coa' | 'gl' | 'close'
  | 'ap' | 'ar' | 'cash' | 'tax' | 'budget'
  | 'assets' | 'revenue' | 'intercompany' | 'project'
  | 'reporting' | 'integrations';

type Item = { title: string; subtitle: string; to: string; icon: LucideIcon };

// ─── لوحة ألوان مالية: كحلي، أخضر داكن، ذهبي فحمي، بنفسجي، أزرق فولاذي، عنابي ───
const themes = [
  { grad: 'from-[#1e3a5f] to-[#2563eb]', bar: 'bg-[#2563eb]', num: 'text-[#1d4ed8]' },
  { grad: 'from-[#064e3b] to-[#059669]', bar: 'bg-[#059669]', num: 'text-[#047857]' },
  { grad: 'from-[#78350f] to-[#d97706]', bar: 'bg-[#d97706]', num: 'text-[#b45309]' },
  { grad: 'from-[#312e81] to-[#7c3aed]', bar: 'bg-[#7c3aed]', num: 'text-[#6d28d9]' },
  { grad: 'from-[#0c4a6e] to-[#0891b2]', bar: 'bg-[#0891b2]', num: 'text-[#0e7490]' },
  { grad: 'from-[#881337] to-[#e11d48]', bar: 'bg-[#e11d48]', num: 'text-[#be123c]' },
] as const;

const units: Record<FinanceUnitKey, { title: string; subtitle: string; items: Item[] }> = {
  // ── لوحة المالية: مدخل لكل الوحدات ──
  main: { title: 'بوابة المالية', subtitle: 'انتقل بين وحدات المالية', items: [
    { title: 'الأساس المالي', subtitle: 'كيانات وأبعاد', to: '/app/finance/foundation', icon: Building2 },
    { title: 'دليل الحسابات', subtitle: 'شجرة الحسابات', to: '/app/finance/chart-of-accounts', icon: Layers },
    { title: 'القيود والدفتر', subtitle: 'اليومية والأستاذ', to: '/app/finance/journal-entries', icon: FileText },
    { title: 'الفترات والإغلاق', subtitle: 'الإقفال والتدقيق', to: '/app/finance/accounting-periods', icon: CalendarClock },
    { title: 'الذمم الدائنة', subtitle: 'الموردون', to: '/app/finance/accounts-payable', icon: Coins },
    { title: 'الذمم المدينة', subtitle: 'العملاء', to: '/app/finance/accounts-receivable', icon: Coins },
    { title: 'النقد والبنوك', subtitle: 'الخزينة', to: '/app/finance/cash-management', icon: Landmark },
    { title: 'الضرائب', subtitle: 'الإقرارات', to: '/app/finance/tax-management', icon: FileText },
    { title: 'الموازنات', subtitle: 'التخطيط', to: '/app/finance/budget', icon: BarChart3 },
    { title: 'الأصول الثابتة', subtitle: 'الإهلاك', to: '/app/finance/fixed-assets', icon: Building2 },
    { title: 'الإيرادات', subtitle: 'الاعتراف', to: '/app/finance/revenue-recognition', icon: Coins },
    { title: 'المعاملات البينية', subtitle: 'التوحيد', to: '/app/finance/intercompany', icon: Landmark },
    { title: 'محاسبة المشاريع', subtitle: 'تكاليف المشاريع', to: '/app/finance/project-accounting', icon: FolderKanban },
    { title: 'التقارير', subtitle: 'التحليلات', to: '/app/finance/reports', icon: BarChart3 },
    { title: 'التكاملات', subtitle: 'الربط', to: '/app/finance/integrations', icon: Layers },
  ]},

  // ── 00 الأساس المالي ──
  foundation: { title: 'الأساس المالي', subtitle: 'الكيانات، العضويات، الفترات، الأبعاد، أسعار الصرف', items: [
    { title: 'لوحة الأساس', subtitle: 'نظرة عامة', to: '/app/finance/foundation', icon: Building2 },
    { title: 'إعداد المالية', subtitle: 'كيان وسنة مالية', to: '/app/finance/setup', icon: Settings },
    { title: 'الكيانات المتعددة', subtitle: 'الكيانات القانونية', to: '/app/finance/multi-entity', icon: Landmark },
    { title: 'عضويات الكيان', subtitle: 'الصلاحيات المالية', to: '/app/finance/entity-memberships', icon: ShieldCheck },
    { title: 'مراكز التكلفة', subtitle: 'الأبعاد', to: '/app/finance/cost-centers', icon: Layers },
    { title: 'المشاريع', subtitle: 'أبعاد المشاريع', to: '/app/finance/projects', icon: FolderKanban },
    { title: 'أسعار الصرف', subtitle: 'العملات', to: '/app/finance/exchange-rates', icon: Coins },
  ]},

  // ── 01 دليل الحسابات ──
  coa: { title: 'دليل الحسابات والأبعاد', subtitle: 'شجرة الحسابات وسياسات الأبعاد', items: [
    { title: 'دليل الحسابات', subtitle: 'الشجرة والسياسات', to: '/app/finance/chart-of-accounts', icon: Layers },
    { title: 'مراكز التكلفة', subtitle: 'الأبعاد', to: '/app/finance/cost-centers', icon: Building2 },
    { title: 'المشاريع', subtitle: 'الأبعاد', to: '/app/finance/projects', icon: FolderKanban },
  ]},

  // ── 02 القيود والدفتر العام ──
  gl: { title: 'القيود والدفتر العام', subtitle: 'دورة حياة القيد، دفتر الأستاذ، ميزان المراجعة', items: [
    { title: 'قيود اليومية', subtitle: 'إنشاء واعتماد وترحيل', to: '/app/finance/journal-entries', icon: FileText },
    { title: 'دفتر الأستاذ', subtitle: 'حركة الحسابات', to: '/app/finance/general-ledger', icon: Landmark },
    { title: 'ميزان المراجعة', subtitle: 'الأرصدة', to: '/app/finance/trial-balance', icon: BarChart3 },
  ]},

  // ── 03 الفترات والإغلاق ──
  close: { title: 'الفترات والإغلاق والتدقيق', subtitle: 'جاهزية الإقفال، قوائم المهام، سجل التدقيق', items: [
    { title: 'الفترات المحاسبية', subtitle: 'الإقفال والفتح', to: '/app/finance/accounting-periods', icon: CalendarClock },
    { title: 'التدقيق المالي', subtitle: 'سجل الأحداث', to: '/app/finance/system-notes', icon: ShieldCheck },
  ]},

  // ── 04 الذمم الدائنة ──
  ap: { title: 'الذمم الدائنة', subtitle: 'الموردون، الفواتير، الدفعات، أعمار الذمم', items: [
    { title: 'الموردون', subtitle: 'سجل الموردين', to: '/app/finance/vendors', icon: Building2 },
    { title: 'فواتير الموردين', subtitle: 'الفواتير والسطور', to: '/app/finance/accounts-payable', icon: FileText },
    { title: 'الدفعات', subtitle: 'دفعات الموردين', to: '/app/finance/vendor-payments', icon: Coins },
    { title: 'أعمار الذمم', subtitle: 'تحليل الاستحقاق', to: '/app/finance/accounts-payable/aging', icon: CalendarClock },
  ]},

  // ── 05 الذمم المدينة ──
  ar: { title: 'الذمم المدينة والتحصيل', subtitle: 'العملاء، الفواتير، سندات القبض، الأعمار', items: [
    { title: 'العملاء والفواتير', subtitle: 'فواتير العملاء', to: '/app/finance/accounts-receivable', icon: FileText },
    { title: 'الاعتراف بالإيرادات', subtitle: 'الإيراد المؤجل', to: '/app/finance/revenue-recognition', icon: Coins },
  ]},

  // ── 06 النقد والبنوك ──
  cash: { title: 'النقد والبنوك', subtitle: 'الحسابات البنكية، الكشوف، المطابقة، التنبؤ', items: [
    { title: 'إدارة النقد', subtitle: 'الحسابات والتسويات', to: '/app/finance/cash-management', icon: Landmark },
    { title: 'استيراد الكشوف', subtitle: 'كشوف البنك', to: '/app/finance/bank-statement-import', icon: FileText },
    { title: 'التنبؤ النقدي', subtitle: 'السيناريوهات', to: '/app/finance/cash-forecast', icon: BarChart3 },
  ]},

  // ── 07 الضرائب ──
  tax: { title: 'الضرائب والتقديم', subtitle: 'الأكواد الضريبية والإقرارات', items: [
    { title: 'إدارة الضرائب', subtitle: 'الأكواد والإقرارات', to: '/app/finance/tax-management', icon: Coins },
  ]},

  // ── 08 الموازنات ──
  budget: { title: 'الموازنات والتنبؤات', subtitle: 'الموازنات، تحليل التباين، التنبؤ النقدي', items: [
    { title: 'الموازنات', subtitle: 'الموازنات والسطور', to: '/app/finance/budget', icon: BarChart3 },
    { title: 'تحليل التباين', subtitle: 'المخطط مقابل الفعلي', to: '/app/finance/budget-variance', icon: Layers },
    { title: 'التنبؤ النقدي', subtitle: 'السيناريوهات', to: '/app/finance/cash-forecast', icon: Coins },
  ]},

  // ── 09 الأصول الثابتة ──
  assets: { title: 'الأصول الثابتة', subtitle: 'سجل الأصول، جداول الإهلاك، الاستبعاد', items: [
    { title: 'الأصول الثابتة', subtitle: 'السجل والإهلاك', to: '/app/finance/fixed-assets', icon: Building2 },
  ]},

  // ── 10 الاعتراف بالإيرادات ──
  revenue: { title: 'الاعتراف بالإيرادات', subtitle: 'عقود الإيراد وجداول الاعتراف', items: [
    { title: 'الاعتراف بالإيرادات', subtitle: 'العقود والجداول', to: '/app/finance/revenue-recognition', icon: Coins },
    { title: 'فواتير العملاء', subtitle: 'مصدر الإيراد', to: '/app/finance/accounts-receivable', icon: FileText },
  ]},

  // ── 11 المعاملات البينية ──
  intercompany: { title: 'المعاملات البينية والتوحيد', subtitle: 'المطابقة والاستبعاد وقيود التوحيد', items: [
    { title: 'المعاملات البينية', subtitle: 'المطابقة والاستبعاد', to: '/app/finance/intercompany', icon: Landmark },
    { title: 'الكيانات المتعددة', subtitle: 'الكيانات', to: '/app/finance/multi-entity', icon: Building2 },
  ]},

  // ── 12 محاسبة المشاريع ──
  project: { title: 'محاسبة المشاريع', subtitle: 'موازنات المشاريع والفعليات', items: [
    { title: 'محاسبة المشاريع', subtitle: 'الموازنات والفعليات', to: '/app/finance/project-accounting', icon: FolderKanban },
    { title: 'المشاريع', subtitle: 'سجل المشاريع', to: '/app/finance/projects', icon: Building2 },
  ]},

  // ── 13 التقارير ──
  reporting: { title: 'التقارير والتحليلات', subtitle: 'التقارير المالية، ميزان المراجعة، دفتر الأستاذ، التصدير', items: [
    { title: 'التقارير المالية', subtitle: 'مركز التقارير', to: '/app/finance/reports', icon: BarChart3 },
    { title: 'ميزان المراجعة', subtitle: 'الأرصدة', to: '/app/finance/trial-balance', icon: FileText },
    { title: 'دفتر الأستاذ', subtitle: 'حركة الحسابات', to: '/app/finance/general-ledger', icon: Landmark },
    { title: 'تحليل التباين', subtitle: 'الموازنات', to: '/app/finance/budget-variance', icon: Layers },
  ]},

  // ── 14 التكاملات ──
  integrations: { title: 'التكاملات المالية', subtitle: 'الموصّلات، الأحداث، جسر الترحيل', items: [
    { title: 'التكاملات', subtitle: 'الموصّلات والأحداث', to: '/app/finance/integrations', icon: Layers },
    { title: 'قيود اليومية', subtitle: 'هدف الترحيل', to: '/app/finance/journal-entries', icon: FileText },
  ]},
};

export function FinanceUnitNav({ unit }: { unit: FinanceUnitKey }) {
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
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-[#1e3a5f] to-[#1d4ed8]"
            style={{ boxShadow: '0 2px 8px rgba(30,58,95,0.30)' }}
          >
            <Landmark size={17} strokeWidth={1.75} className="text-white" aria-hidden="true" />
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
            Finance Flow
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

      {/* ══════════ البطاقات القابلة للتمرير ══════════ */}
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
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br ${t.grad} flex items-center justify-center shadow`}
                    >
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

                  <div
                    className={`absolute bottom-0 right-0 left-0 h-[2.5px] rounded-b-xl ${t.bar} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}
                  />
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
