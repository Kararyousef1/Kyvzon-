/**
 * ═════════════════════════════════════════════════════════════════════════
 *  AutomationOverview — نظرة عامة على وحدة أتمتة التسويق
 *  رحلة العميل (6 مراحل) · KPIs · قوالب الحملات الخمس · أنواع المحفزات.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useNavigate } from 'react-router-dom';
import {
  Eye, Search, ShoppingCart, Rocket, RefreshCw, TrendingUp,
  Users, Flame, Send, CheckCircle2, Zap, Clock, MousePointerClick, MinusCircle,
} from 'lucide-react';
import { CAMPAIGN_TEMPLATES } from '../../../services/sdk';
import { useKpis, CAMPAIGN_LABEL } from './useAutomation';
import { MARKETING_BASE } from '../marketingCatalog';

const JOURNEY = [
  { key: 'awareness', label: 'الوعي', desc: 'اكتشف مشكلته ويبحث عن حل', icon: Eye },
  { key: 'consideration', label: 'الاهتمام', desc: 'يقارن الحلول المتاحة', icon: Search },
  { key: 'purchase', label: 'الشراء', desc: 'اتخذ قرار الشراء', icon: ShoppingCart },
  { key: 'onboarding', label: 'التأهيل', desc: 'بدأ استخدام المنتج', icon: Rocket },
  { key: 'retention', label: 'الاستبقاء', desc: 'يستمر ويجدّد', icon: RefreshCw },
  { key: 'expansion', label: 'التوسع', desc: 'يشتري المزيد أو يرشّح', icon: TrendingUp },
];

// خرائط ألوان ثابتة (Tailwind JIT لا يدعم الأسماء الديناميكية)
const ICON_BG: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-600',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  orange: 'bg-orange-50 text-orange-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

const TRIGGER_TYPES = [
  { label: 'محفزات زمنية', desc: 'بعد ساعتين من التسجيل · قبل 30 يوماً من التجديد', icon: Clock, color: 'sky' },
  { label: 'محفزات سلوكية', desc: 'فتح البريد · الضغط على رابط · عدم الفتح', icon: MousePointerClick, color: 'fuchsia' },
  { label: 'محفزات بيانات', desc: 'وصل لعتبة نقاط · تغيّرت مرحلته في CRM', icon: Zap, color: 'amber' },
  { label: 'محفزات سلبية', desc: 'لم يزر منذ X يوم · عربة متروكة', icon: MinusCircle, color: 'rose' },
];

function StatCard({ icon: Icon, label, value, hint, color }: {
  icon: typeof Users; label: string; value: string | number; hint?: string; color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ICON_BG[color] || ICON_BG.fuchsia}`}>
          <Icon size={18} />
        </div>
      </div>
      <p className="text-2xl font-black text-slate-800 mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function AutomationOverview() {
  const navigate = useNavigate();
  const { data: kpi, loading } = useKpis();

  return (
    <div className="space-y-6">
      {/* بطاقات KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Users} label="إجمالي العملاء المحتملين" value={loading ? '…' : kpi.totalLeads} color="fuchsia" />
        <StatCard icon={Flame} label="عملاء ساخنون / جاهزون" value={loading ? '…' : kpi.byTemperature.hot + kpi.byTemperature.sales_ready} color="orange" />
        <StatCard icon={Send} label="إجراءات منفّذة" value={loading ? '…' : kpi.actionsSent} hint="تشمل المُحاكاة (hook للبريد/الرسائل)" color="sky" />
        <StatCard icon={CheckCircle2} label="نسبة إكمال الرحلات" value={loading ? '…' : `${kpi.workflowCompletionRate}%`} color="emerald" />
      </div>

      {/* رحلة العميل */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">رحلة العميل (Customer Journey)</h2>
        <p className="text-xs text-slate-500 mb-4">المسار الكامل من أول تواصل حتى الولاء — تبني الأتمتة لكل مرحلة تسلسلاً ذكياً.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {JOURNEY.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.key} className="relative rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-fuchsia-600 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center mx-auto text-fuchsia-600">
                  <Icon size={18} />
                </div>
                <p className="text-xs font-bold text-slate-700 mt-2">{s.label}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* أنواع المحفزات */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-4">أنواع المحفزات (Triggers)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TRIGGER_TYPES.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label} className="rounded-xl border border-slate-100 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${ICON_BG[t.color] || ICON_BG.fuchsia}`}>
                  <Icon size={18} />
                </div>
                <p className="text-sm font-bold text-slate-700 mt-3">{t.label}</p>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* قوالب الحملات */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-black text-slate-800">قوالب الحملات الجاهزة</h2>
            <p className="text-xs text-slate-500 mt-0.5">أنشئ رحلة كاملة بنقرة — يمكنك تعديلها بعد الإنشاء.</p>
          </div>
          <button
            onClick={() => navigate(`${MARKETING_BASE}/automation/workflows`)}
            className="text-xs bg-fuchsia-600 text-white px-3 py-2 rounded-xl hover:bg-fuchsia-700 transition-colors"
          >
            إدارة الرحلات
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CAMPAIGN_TEMPLATES.map((c) => (
            <div key={c.type} className="rounded-xl border border-slate-100 p-4 hover:border-fuchsia-200 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-2 py-0.5 rounded-full">
                  {CAMPAIGN_LABEL[c.type]}
                </span>
                <span className="text-[10px] text-slate-400">{c.steps.length} خطوات</span>
              </div>
              <p className="text-sm font-bold text-slate-700 mt-2">{c.label}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{c.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
