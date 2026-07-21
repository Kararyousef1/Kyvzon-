/**
 * ═════════════════════════════════════════════════════════════════════════
 *  WorkflowsPage — منشئ وإدارة الرحلات (Workflows)
 *  قائمة الرحلات · إنشاء من قالب أو مخصّص · عرض/تفعيل/إيقاف ·
 *  فتح المنشئ (WorkflowBuilder) لتحرير الخطوات وإدخال العملاء وتشغيل المحرك.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import { Plus, X, Play, Pause, Route as RouteIcon, ChevronLeft, Zap } from 'lucide-react';
import {
  marketingWorkflowService, workflowStepService, CAMPAIGN_TEMPLATES,
  type MarketingWorkflowInput, type CampaignType, type MarketingWorkflow,
} from '../../../services/sdk';
import { useWorkflows, CAMPAIGN_LABEL, TRIGGER_LABEL, WF_STATUS_LABEL } from './useAutomation';
import WorkflowBuilder from './WorkflowBuilder';

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-500',
  active: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
  paused: 'bg-amber-50 text-amber-600 border border-amber-200',
  archived: 'bg-slate-100 text-slate-400',
};

export default function WorkflowsPage() {
  const { data: workflows, loading, reload } = useWorkflows();
  const [selected, setSelected] = useState<MarketingWorkflow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'template' | 'custom'>('template');
  const [custom, setCustom] = useState<MarketingWorkflowInput>({
    name: '', campaign_type: 'custom', trigger_type: 'behavioral', trigger_event: '', frequency_cap_per_day: 3,
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const createFromTemplate = async (type: CampaignType) => {
    const tpl = CAMPAIGN_TEMPLATES.find((t) => t.type === type);
    if (!tpl) return;
    setBusy(true); setCreateError(null);
    try {
      const wf = await marketingWorkflowService.createWorkflow({
        name: tpl.label, campaign_type: tpl.type, description: tpl.description,
        trigger_type: tpl.triggerType, trigger_event: tpl.triggerEvent,
        status: 'draft', frequency_cap_per_day: 3,
      });
      // إنشاء الخطوات
      for (const s of tpl.steps) {
        await workflowStepService.createStep({ ...s, workflow_id: wf.id });
      }
      setShowCreate(false); reload(); setSelected(wf);
    } catch (e) { setCreateError(e instanceof Error ? e.message : 'تعذّر الإنشاء'); }
    finally { setBusy(false); }
  };

  const createCustom = async () => {
    if (!custom.name.trim()) { setCreateError('اسم الرحلة مطلوب'); return; }
    setBusy(true); setCreateError(null);
    try {
      const wf = await marketingWorkflowService.createWorkflow({ ...custom, status: 'draft' });
      setShowCreate(false); reload(); setSelected(wf);
      setCustom({ name: '', campaign_type: 'custom', trigger_type: 'behavioral', trigger_event: '', frequency_cap_per_day: 3 });
    } catch (e) { setCreateError(e instanceof Error ? e.message : 'تعذّر الإنشاء'); }
    finally { setBusy(false); }
  };

  const toggleStatus = async (wf: MarketingWorkflow) => {
    setBusy(true);
    try {
      await marketingWorkflowService.setStatus(wf.id, wf.status === 'active' ? 'paused' : 'active');
      reload();
    } catch { /* noop */ } finally { setBusy(false); }
  };

  if (selected) {
    return (
      <div className="space-y-4">
        <button onClick={() => { setSelected(null); reload(); }}
          className="flex items-center gap-1 text-sm text-fuchsia-600 hover:underline">
          <ChevronLeft size={16} /> رجوع لقائمة الرحلات
        </button>
        <WorkflowBuilder workflow={selected} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{loading ? 'جارٍ التحميل…' : `${workflows.length} رحلة`}</p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700">
          <Plus size={16} /> رحلة جديدة
        </button>
      </div>

      {workflows.length === 0 && !loading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <RouteIcon size={36} className="mx-auto text-slate-300" />
          <p className="text-slate-500 mt-3 font-semibold">لا رحلات بعد</p>
          <p className="text-xs text-slate-400 mt-1">أنشئ رحلتك الأولى من قالب جاهز أو من الصفر.</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 bg-fuchsia-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-fuchsia-700">إنشاء رحلة</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-fuchsia-200 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[wf.status]}`}>{WF_STATUS_LABEL[wf.status]}</span>
                <button onClick={() => toggleStatus(wf)} disabled={busy}
                  className="text-slate-400 hover:text-fuchsia-600" title={wf.status === 'active' ? 'إيقاف' : 'تفعيل'}>
                  {wf.status === 'active' ? <Pause size={16} /> : <Play size={16} />}
                </button>
              </div>
              <h3 className="font-black text-slate-800 mt-2">{wf.name}</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2 min-h-[2rem]">{wf.description || '—'}</p>
              <div className="flex items-center gap-2 mt-3 text-[10px]">
                <span className="bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{CAMPAIGN_LABEL[wf.campaign_type]}</span>
                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><Zap size={9} /> {TRIGGER_LABEL[wf.trigger_type]}</span>
              </div>
              <button onClick={() => setSelected(wf)}
                className="w-full mt-3 text-sm border border-slate-200 rounded-xl py-2 hover:bg-slate-50 text-slate-700">
                فتح المنشئ
              </button>
            </div>
          ))}
        </div>
      )}

      {/* نافذة الإنشاء */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">رحلة جديدة</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setTab('template')}
                className={`flex-1 text-sm py-2 rounded-xl ${tab === 'template' ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-600'}`}>من قالب جاهز</button>
              <button onClick={() => setTab('custom')}
                className={`flex-1 text-sm py-2 rounded-xl ${tab === 'custom' ? 'bg-fuchsia-600 text-white' : 'bg-slate-100 text-slate-600'}`}>مخصّص</button>
            </div>

            {tab === 'template' ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {CAMPAIGN_TEMPLATES.map((t) => (
                  <button key={t.type} disabled={busy} onClick={() => createFromTemplate(t.type)}
                    className="w-full text-right rounded-xl border border-slate-200 p-3 hover:border-fuchsia-300 hover:bg-fuchsia-50/40 disabled:opacity-60">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-fuchsia-50 text-fuchsia-600 px-2 py-0.5 rounded-full">{CAMPAIGN_LABEL[t.type]}</span>
                      <span className="text-[10px] text-slate-400">{t.steps.length} خطوات</span>
                    </div>
                    <p className="font-bold text-slate-700 text-sm mt-1">{t.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{t.description}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500">اسم الرحلة *</label>
                  <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">الوصف</label>
                  <input value={custom.description || ''} onChange={(e) => setCustom({ ...custom, description: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">نوع المحفّز</label>
                    <select value={custom.trigger_type} onChange={(e) => setCustom({ ...custom, trigger_type: e.target.value as MarketingWorkflowInput['trigger_type'] })}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                      <option value="time_based">زمني</option>
                      <option value="behavioral">سلوكي</option>
                      <option value="data_based">بيانات</option>
                      <option value="negative">سلبي</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">حدث الدخول</label>
                    <input value={custom.trigger_event || ''} onChange={(e) => setCustom({ ...custom, trigger_event: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="form_submitted" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">حد التردد اليومي (Frequency Cap) — لكل عميل</label>
                  <input type="number" value={custom.frequency_cap_per_day ?? ''} onChange={(e) => setCustom({ ...custom, frequency_cap_per_day: e.target.value ? parseInt(e.target.value, 10) : null })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" placeholder="اتركه فارغاً = بلا حد" />
                </div>
                <button onClick={createCustom} disabled={busy}
                  className="w-full bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">
                  {busy ? 'جارٍ الإنشاء…' : 'إنشاء الرحلة'}
                </button>
              </div>
            )}
            {createError && <p className="text-xs text-rose-600 mt-3">{createError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
