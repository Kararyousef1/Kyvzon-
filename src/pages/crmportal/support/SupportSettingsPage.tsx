/**
 * SupportSettingsPage — إعدادات الدعم: سياسات SLA + الردود الجاهزة + قواعد التوزيع.
 */
import { useState } from 'react';
import { Plus, X, ShieldCheck, MessageSquareText, GitBranch, Sparkles } from 'lucide-react';
import {
  crmSlaService, crmCannedService, crmRoutingService,
  type CrmCannedResponseInput, type CrmRoutingRuleInput, type RoutingStrategy, type RoutingMatchType,
  TICKET_PRIORITY_LABEL, ROUTING_STRATEGY_LABEL,
} from '../../../services/sdk';
import { useSlaPolicies, useCanned, useRoutingRules } from './useSupport';

export default function SupportSettingsPage() {
  const sla = useSlaPolicies();
  const canned = useCanned();
  const routing = useRoutingRules();
  const [seeding, setSeeding] = useState(false);
  const [showCanned, setShowCanned] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [cForm, setCForm] = useState<CrmCannedResponseInput>({ title: '', body: '' });
  const [rForm, setRForm] = useState<CrmRoutingRuleInput>({ name: '', strategy: 'rule_based', match_type: 'ticket_type', match_value: '', priority: 0 });
  const [busy, setBusy] = useState(false);

  const seedSla = async () => { setSeeding(true); try { await crmSlaService.seedDefault(); sla.reload(); } catch { /* noop */ } finally { setSeeding(false); } };
  const saveCanned = async () => { if (!cForm.title.trim() || !cForm.body.trim()) return; setBusy(true); try { await crmCannedService.createResponse(cForm); setShowCanned(false); setCForm({ title: '', body: '' }); canned.reload(); } catch { /* noop */ } finally { setBusy(false); } };
  const saveRoute = async () => { if (!rForm.name.trim()) return; setBusy(true); try { await crmRoutingService.createRule(rForm); setShowRoute(false); setRForm({ name: '', strategy: 'rule_based', match_type: 'ticket_type', match_value: '', priority: 0 }); routing.reload(); } catch { /* noop */ } finally { setBusy(false); } };

  return (
    <div className="space-y-5">
      {/* SLA */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><ShieldCheck size={16} className="text-cyan-600" /> سياسات الـ SLA</h3>
          {sla.data.length === 0 && <button onClick={seedSla} disabled={seeding} className="flex items-center gap-1 text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700 disabled:opacity-60"><Sparkles size={13} /> تهيئة افتراضية</button>}
        </div>
        {sla.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : sla.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا سياسات — هيّئ السياسات الافتراضية (P1-P4).</p>
            : <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{sla.data.map((p) => (
              <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <p className="text-sm font-bold text-slate-700">{TICKET_PRIORITY_LABEL[p.priority]}</p>
                <p className="text-xs text-slate-500 mt-1">رد أول: {p.first_response_minutes >= 60 ? `${p.first_response_minutes / 60} س` : `${p.first_response_minutes} د`}</p>
                <p className="text-xs text-slate-500">الحل: {p.resolution_minutes >= 60 ? `${p.resolution_minutes / 60} س` : `${p.resolution_minutes} د`}</p>
              </div>
            ))}</div>}
      </div>

      {/* Canned responses */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><MessageSquareText size={16} className="text-cyan-600" /> الردود الجاهزة ({canned.data.length})</h3>
          <button onClick={() => setShowCanned(true)} className="flex items-center gap-1 text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700"><Plus size={13} /> رد</button>
        </div>
        {canned.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : canned.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا ردود جاهزة — توفّر 40-60% من وقت الكتابة.</p>
            : <div className="space-y-2">{canned.data.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-100 p-3"><p className="text-sm font-semibold text-slate-700">{c.title}</p><p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{c.body}</p></div>
            ))}</div>}
      </div>

      {/* Routing rules */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><GitBranch size={16} className="text-cyan-600" /> قواعد التوزيع الذكي ({routing.data.length})</h3>
          <button onClick={() => setShowRoute(true)} className="flex items-center gap-1 text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700"><Plus size={13} /> قاعدة</button>
        </div>
        {routing.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : routing.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا قواعد توزيع — وجّه التذاكر تلقائياً حسب النوع/الأولوية/المهارة.</p>
            : <div className="space-y-2">{routing.data.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                <div><p className="text-sm font-semibold text-slate-700">{r.name}</p><p className="text-xs text-slate-400">{ROUTING_STRATEGY_LABEL[r.strategy]}{r.match_value ? ` · ${r.match_value}` : ''}</p></div>
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${r.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>{r.is_active ? 'مفعّلة' : 'معطّلة'}</span>
              </div>
            ))}</div>}
      </div>

      {showCanned && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCanned(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">رد جاهز</h3><button onClick={() => setShowCanned(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">العنوان *</label><input value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">النص *</label><textarea value={cForm.body} onChange={(e) => setCForm({ ...cForm, body: e.target.value })} rows={4} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" /></div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={saveCanned} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowCanned(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}

      {showRoute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowRoute(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">قاعدة توزيع</h3><button onClick={() => setShowRoute(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">الاسم *</label><input value={rForm.name} onChange={(e) => setRForm({ ...rForm, name: e.target.value })} placeholder="فريق التقنية" className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div><label className="text-xs text-slate-500">الاستراتيجية</label><select value={rForm.strategy} onChange={(e) => setRForm({ ...rForm, strategy: e.target.value as RoutingStrategy })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(ROUTING_STRATEGY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {rForm.strategy === 'rule_based' && <>
                <div><label className="text-xs text-slate-500">نوع المطابقة</label><select value={rForm.match_type || 'ticket_type'} onChange={(e) => setRForm({ ...rForm, match_type: e.target.value as RoutingMatchType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="ticket_type">نوع التذكرة</option><option value="priority">الأولوية</option><option value="required_skill">المهارة</option></select></div>
                <div><label className="text-xs text-slate-500">القيمة</label><input value={rForm.match_value || ''} onChange={(e) => setRForm({ ...rForm, match_value: e.target.value })} placeholder={rForm.match_type === 'priority' ? 'p1' : 'zkteco'} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={saveRoute} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">حفظ</button><button onClick={() => setShowRoute(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
