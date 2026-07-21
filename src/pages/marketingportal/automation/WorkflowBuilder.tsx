/**
 * ═════════════════════════════════════════════════════════════════════════
 *  WorkflowBuilder — منشئ الرحلة البصري (المكوّنات الخمسة من التقرير)
 *    Entry Trigger · Actions · Timing (wait) · Conditions/Branches
 *  + إدخال العملاء (Enroll) + تشغيل المحرك خطوة بخطوة (Advance).
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useState } from 'react';
import {
  Plus, X, Clock, GitBranch, Mail, MessageSquare, Tag, ArrowLeftRight,
  Bell, Trash2, PlayCircle, UserPlus, CheckCircle2, ChevronDown,
} from 'lucide-react';
import {
  workflowStepService, workflowEnrollmentService,
  type MarketingWorkflow, type WorkflowStepInput, type StepType, type ActionType, type WorkflowStep,
} from '../../../services/sdk';
import {
  useWorkflowSteps, useEnrollments, useLeads,
  ACTION_LABEL, TRIGGER_LABEL,
} from './useAutomation';

const ACTION_ICON: Record<string, typeof Mail> = {
  send_email: Mail, send_sms: MessageSquare, send_whatsapp: MessageSquare,
  add_tag: Tag, remove_tag: Tag, change_pipeline_stage: ArrowLeftRight,
  internal_notification: Bell,
};

const STEP_TYPE_META: Record<StepType, { label: string; color: string; icon: typeof Mail }> = {
  action: { label: 'إجراء', color: 'fuchsia', icon: Mail },
  wait: { label: 'انتظار', color: 'sky', icon: Clock },
  condition: { label: 'شرط', color: 'amber', icon: GitBranch },
  branch: { label: 'تفرّع', color: 'amber', icon: GitBranch },
};
const STEP_COLOR: Record<string, string> = {
  fuchsia: 'border-fuchsia-200 bg-fuchsia-50/50',
  sky: 'border-sky-200 bg-sky-50/50',
  amber: 'border-amber-200 bg-amber-50/50',
};
const STEP_BADGE: Record<string, string> = {
  fuchsia: 'bg-fuchsia-600', sky: 'bg-sky-500', amber: 'bg-amber-500',
};

export default function WorkflowBuilder({ workflow }: { workflow: MarketingWorkflow }) {
  const { data: steps, loading, reload } = useWorkflowSteps(workflow.id);
  const { data: enrollments, reload: reloadEnroll } = useEnrollments(workflow.id);
  const { data: leads } = useLeads();
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const [newStep, setNewStep] = useState<{ step_type: StepType; action_type: ActionType; wait_hours: number; configKey: string; configVal: string }>({
    step_type: 'action', action_type: 'send_email', wait_hours: 24, configKey: 'template', configVal: 'welcome',
  });

  const addStep = async () => {
    setBusy(true);
    try {
      const order = steps.length === 0 ? 0 : Math.max(...steps.map((s) => s.step_order)) + 1;
      const input: WorkflowStepInput = {
        workflow_id: workflow.id, step_order: order, step_type: newStep.step_type,
      };
      if (newStep.step_type === 'action') {
        input.action_type = newStep.action_type;
        input.config = newStep.configKey ? { [newStep.configKey]: newStep.configVal } : {};
      } else if (newStep.step_type === 'wait') {
        input.wait_hours = newStep.wait_hours;
      } else {
        input.wait_for_event = newStep.configVal || 'email_opened';
      }
      await workflowStepService.createStep(input);
      setShowAdd(false); reload();
    } catch { /* noop */ } finally { setBusy(false); }
  };

  const removeStep = async (id: string) => {
    setBusy(true);
    try { await workflowStepService.delete(id); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  const enroll = async (leadId: string) => {
    setBusy(true); setRunMsg(null);
    try {
      await workflowEnrollmentService.enroll(workflow.id, leadId);
      setEnrollOpen(false); reloadEnroll();
      setRunMsg('تم إدخال العميل في الرحلة.');
    } catch (e) { setRunMsg(e instanceof Error ? e.message : 'تعذّر الإدخال'); }
    finally { setBusy(false); }
  };

  const advance = async (enrollmentId: string) => {
    setBusy(true); setRunMsg(null);
    try {
      const result = await workflowEnrollmentService.advance(enrollmentId);
      reloadEnroll();
      const map: Record<string, string> = {
        advanced: 'تقدّمت الرحلة خطوة (الإجراء نُفّذ وسُجّل).',
        completed: 'اكتملت رحلة العميل.',
        frequency_capped: 'تم التأجيل: بلغ العميل حدّ التردد اليومي.',
      };
      setRunMsg(map[result] || result);
    } catch (e) { setRunMsg(e instanceof Error ? e.message : 'تعذّر التشغيل'); }
    finally { setBusy(false); }
  };

  const stepConfigLabel = (s: WorkflowStep): string => {
    if (s.step_type === 'action') {
      const cfg = Object.entries(s.config || {}).map(([k, v]) => `${k}: ${v}`).join('، ');
      return `${ACTION_LABEL[s.action_type || ''] || s.action_type || ''}${cfg ? ` (${cfg})` : ''}`;
    }
    if (s.step_type === 'wait') return `انتظر ${s.wait_hours ?? 0} ساعة`;
    return `انتظر حتى: ${s.wait_for_event || '—'}`;
  };

  return (
    <div className="space-y-5">
      {/* بطاقة نقطة الدخول */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[11px] text-slate-400">نقطة الدخول (Entry Trigger)</p>
            <p className="font-bold text-slate-800">
              محفّز {TRIGGER_LABEL[workflow.trigger_type]}
              {workflow.trigger_event ? <span className="font-mono text-xs text-slate-500"> — {workflow.trigger_event}</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {workflow.frequency_cap_per_day != null && (
              <span className="text-[11px] bg-slate-100 text-slate-500 px-2 py-1 rounded-lg">حد التردد: {workflow.frequency_cap_per_day}/يوم</span>
            )}
            <button onClick={() => setEnrollOpen(true)}
              className="flex items-center gap-1.5 text-sm bg-fuchsia-600 text-white px-3 py-2 rounded-xl hover:bg-fuchsia-700">
              <UserPlus size={15} /> إدخال عميل
            </button>
          </div>
        </div>
      </div>

      {runMsg && (
        <div className="text-sm text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-200 rounded-xl px-4 py-2 flex items-center gap-2">
          <CheckCircle2 size={15} /> {runMsg}
        </div>
      )}

      {/* الخطوات */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-800">خطوات الرحلة</h3>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50">
            <Plus size={15} /> خطوة
          </button>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-6 text-sm">جارٍ التحميل…</p>
        ) : steps.length === 0 ? (
          <p className="text-center text-slate-400 py-6 text-sm">لا خطوات — أضف أول خطوة لبناء الرحلة.</p>
        ) : (
          <div className="space-y-0">
            {steps.map((s, i) => {
              const meta = STEP_TYPE_META[s.step_type];
              const Icon = (s.step_type === 'action' && s.action_type && ACTION_ICON[s.action_type]) || meta.icon;
              return (
                <div key={s.id}>
                  <div className={`rounded-xl border p-3 flex items-center gap-3 ${STEP_COLOR[meta.color]}`}>
                    <span className={`w-7 h-7 rounded-full ${STEP_BADGE[meta.color]} text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>{i + 1}</span>
                    <div className={`w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0`}>
                      <Icon size={16} className="text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-400">{meta.label}</p>
                      <p className="text-sm font-semibold text-slate-700 truncate">{stepConfigLabel(s)}</p>
                    </div>
                    <button onClick={() => removeStep(s.id)} disabled={busy} className="text-slate-300 hover:text-rose-500 flex-shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex justify-center py-1"><ChevronDown size={16} className="text-slate-300" /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* العملاء داخل الرحلة + تشغيل المحرك */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-black text-slate-800 mb-1">العملاء داخل الرحلة</h3>
        <p className="text-xs text-slate-500 mb-4">اضغط «تشغيل الخطوة» لتنفيذ الخطوة الحالية يدوياً (محاكاة المحرك). الإرسال الخارجي يُسجَّل ويُوصَل لاحقاً بوحدتي البريد/الرسائل.</p>
        {enrollments.length === 0 ? (
          <p className="text-center text-slate-400 py-4 text-sm">لا عملاء بعد — أدخل عميلاً من الأعلى.</p>
        ) : (
          <div className="space-y-2">
            {enrollments.map((e) => {
              const lead = leads.find((l) => l.id === e.lead_id);
              const done = e.status === 'completed';
              return (
                <div key={e.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{lead?.full_name || 'عميل'}</p>
                    <p className="text-[11px] text-slate-400">
                      الحالة: {done ? 'مكتملة' : e.status === 'active' ? 'نشطة' : e.status}
                    </p>
                  </div>
                  {done ? (
                    <span className="text-emerald-600 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={14} /> اكتملت</span>
                  ) : (
                    <button onClick={() => advance(e.id)} disabled={busy}
                      className="flex items-center gap-1.5 text-xs bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-200 px-3 py-1.5 rounded-lg hover:bg-fuchsia-100 disabled:opacity-60">
                      <PlayCircle size={14} /> تشغيل الخطوة
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* نافذة إضافة خطوة */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">إضافة خطوة</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">نوع الخطوة</label>
                <select value={newStep.step_type} onChange={(e) => setNewStep({ ...newStep, step_type: e.target.value as StepType })}
                  className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                  <option value="action">إجراء (Action)</option>
                  <option value="wait">انتظار / توقيت (Wait)</option>
                  <option value="condition">شرط / تفرّع (Condition)</option>
                </select>
              </div>

              {newStep.step_type === 'action' && (
                <>
                  <div>
                    <label className="text-xs text-slate-500">الإجراء</label>
                    <select value={newStep.action_type} onChange={(e) => setNewStep({ ...newStep, action_type: e.target.value as ActionType })}
                      className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">
                      {(['send_email', 'send_sms', 'send_whatsapp', 'add_tag', 'remove_tag', 'change_pipeline_stage', 'internal_notification'] as ActionType[]).map((a) => (
                        <option key={a} value={a}>{ACTION_LABEL[a]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500">مفتاح الإعداد</label>
                      <input value={newStep.configKey} onChange={(e) => setNewStep({ ...newStep, configKey: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="template / tag / stage" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">القيمة</label>
                      <input value={newStep.configVal} onChange={(e) => setNewStep({ ...newStep, configVal: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
                    </div>
                  </div>
                </>
              )}

              {newStep.step_type === 'wait' && (
                <div>
                  <label className="text-xs text-slate-500">مدة الانتظار (ساعات)</label>
                  <input type="number" value={newStep.wait_hours} onChange={(e) => setNewStep({ ...newStep, wait_hours: parseInt(e.target.value || '0', 10) })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" />
                </div>
              )}

              {newStep.step_type === 'condition' && (
                <div>
                  <label className="text-xs text-slate-500">انتظر حتى حدث (شجرة القرار)</label>
                  <input value={newStep.configVal} onChange={(e) => setNewStep({ ...newStep, configVal: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" placeholder="email_opened / link_clicked" />
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={addStep} disabled={busy}
                className="flex-1 bg-fuchsia-600 text-white text-sm py-2.5 rounded-xl hover:bg-fuchsia-700 disabled:opacity-60">
                {busy ? 'جارٍ…' : 'إضافة الخطوة'}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إدخال عميل */}
      {enrollOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEnrollOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800">إدخال عميل في الرحلة</h3>
              <button onClick={() => setEnrollOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            {leads.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">لا عملاء — أضف عملاء من تبويب «العملاء المحتملون».</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1">
                {leads.map((l) => (
                  <button key={l.id} disabled={busy} onClick={() => enroll(l.id)}
                    className="w-full flex items-center justify-between text-right rounded-xl border border-slate-100 p-2.5 hover:border-fuchsia-300 hover:bg-fuchsia-50/40">
                    <span className="text-sm text-slate-700">{l.full_name}</span>
                    <span className="text-xs text-slate-400">{l.score} نقطة</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
