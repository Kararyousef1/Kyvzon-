/**
 * PipelineOverview — نظرة عامة: سرعة الصفقة + تنبيهات الركود + مفاهيم التقرير +
 * زر تهيئة خط الأنابيب الافتراضي عند غياب أي pipeline.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, TrendingUp, Clock, Trophy, AlertTriangle, Sparkles, GitBranch } from 'lucide-react';
import {
  crmPipelineService, crmDealService,
  type DealVelocity, type StagnationAlert,
  ALERT_TYPE_LABEL, ALERT_TYPE_COLOR, PIPELINE_TYPE_LABEL,
} from '../../../services/sdk';
import { usePipelines, useAsync } from './usePipeline';
import { CRM_BASE } from '../crmCatalog';

export default function PipelineOverview() {
  const pipelines = usePipelines();
  const velocity = useAsync<DealVelocity | null>(() => crmDealService.velocity(), null);
  const alerts = useAsync<StagnationAlert[]>(() => crmDealService.stagnationAlerts(), []);
  const [seeding, setSeeding] = useState(false);
  const [seedErr, setSeedErr] = useState<string | null>(null);

  const seed = async () => {
    setSeeding(true); setSeedErr(null);
    try { await crmPipelineService.seedDefault(); pipelines.reload(); }
    catch (e) { setSeedErr(e instanceof Error ? e.message : 'تعذّر التهيئة'); } finally { setSeeding(false); }
  };

  const v = velocity.data;
  const cards = useMemo(() => [
    { label: 'الصفقات المفتوحة', value: v?.openDeals ?? 0, icon: GitBranch, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'متوسط قيمة الصفقة', value: `${(v?.avgValue ?? 0).toLocaleString('ar')}`, icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
    { label: 'معدل الفوز', value: `${v?.winRate ?? 0}%`, icon: Trophy, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'متوسط دورة المبيعات', value: `${v?.avgCycleDays ?? 0} يوم`, icon: Clock, color: 'text-amber-600 bg-amber-50' },
  ], [v]);

  if (!pipelines.loading && pipelines.data.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-cyan-300 bg-white p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-cyan-50 text-cyan-600 flex items-center justify-center mx-auto"><GitBranch size={28} /></div>
        <h2 className="font-black text-slate-800 mt-4">لا خطوط أنابيب بعد</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">ابدأ بتهيئة خط الأنابيب الافتراضي "مبيعات جديدة" بمراحله الست (من التقرير) وأسباب الخسارة المعيارية.</p>
        <button onClick={seed} disabled={seeding} className="mt-4 inline-flex items-center gap-2 bg-cyan-600 text-white text-sm px-5 py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">
          <Sparkles size={16} /> {seeding ? 'جارٍ التهيئة…' : 'تهيئة خط الأنابيب الافتراضي'}
        </button>
        {seedErr && <p className="text-xs text-rose-600 mt-3">{seedErr}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Deal Velocity */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <Gauge size={18} className="text-cyan-600" />
          <h2 className="font-black text-slate-800">سرعة الصفقة (Deal Velocity)</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">(عدد الصفقات × متوسط القيمة × معدل الفوز) ÷ متوسط دورة المبيعات</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${c.color}`}><Icon size={17} /></div>
                <p className="text-lg font-black text-slate-800 mt-2.5">{velocity.loading ? '…' : c.value}</p>
                <p className="text-[11px] text-slate-400">{c.label}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-cyan-600 to-blue-700 text-white p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-white/70">الإيراد المتوقع يومياً (Velocity)</p>
            <p className="text-2xl font-black">{velocity.loading ? '…' : `${(v?.velocityPerDay ?? 0).toLocaleString('ar')}`}<span className="text-sm"> /يوم</span></p>
          </div>
          <Gauge size={40} className="text-white/30" />
        </div>
      </div>

      {/* Stagnation Alerts */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-500" /> تنبيهات الصفقات ({alerts.data.length})</h3>
        {alerts.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : alerts.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا تنبيهات — كل الصفقات ضمن المدة الطبيعية ✓</p>
            : <div className="space-y-2">{alerts.data.map((a) => (
              <Link to={`${CRM_BASE}/pipeline/deals/${a.dealId}`} key={a.dealId} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-cyan-300">
                <div><p className="text-sm font-semibold text-slate-700">{a.dealName}</p><p className="text-xs text-slate-400">{a.stageName} · {a.daysInStage} يوم في المرحلة{a.thresholdDays ? ` (عتبة ${a.thresholdDays})` : ''}</p></div>
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${ALERT_TYPE_COLOR[a.alertType]}`}>{ALERT_TYPE_LABEL[a.alertType]}</span>
              </Link>
            ))}</div>}
      </div>

      {/* Pipelines list */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><GitBranch size={16} className="text-cyan-600" /> خطوط الأنابيب ({pipelines.data.length})</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {pipelines.data.map((p) => (
            <Link to={`${CRM_BASE}/pipeline/board`} key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-cyan-300">
              <div><p className="text-sm font-semibold text-slate-700">{p.name}{p.is_default && <span className="text-[10px] text-cyan-500 mr-1">(افتراضي)</span>}</p><p className="text-xs text-slate-400">{PIPELINE_TYPE_LABEL[p.pipeline_type]}</p></div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
