import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, FileText, Loader2, RefreshCw, ShieldCheck, User } from 'lucide-react';
import { systemNoteService, type FinanceAuditEventBoardRecord } from '../../../services/sdk/SystemNoteService';
import { legalEntityService, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

export default function SystemNotesPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [events, setEvents] = useState<FinanceAuditEventBoardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityId, setEntityId] = useState('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entityRows = await legalEntityService.findActive();
      setEntities(entityRows);
      const rows = await systemNoteService.findFinanceAuditEvents({ legalEntityId: entityId || undefined, eventType: filterType || undefined, limit: 250 });
      setEvents(rows);
    } catch (e) {
      addToast(`تعذر تحميل التدقيق المالي: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, entityId, filterType]);

  useEffect(() => { void load(); }, [load]);

  const eventTypes = useMemo(() => Array.from(new Set(events.map(event => event.event_type))).sort(), [events]);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <FinanceUnitNav unit="close" />
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-slate-700 flex items-center gap-2"><ShieldCheck size={14} /> Finance Audit Board — Immutable GRC</p>
          <h1 className="text-3xl font-black">التدقيق المالي والحوكمة</h1>
          <p className="text-slate-500 mt-2">عرض موحد لأحداث `finance_audit_events`: كل إغلاق، ترحيل، عكس، أرشفة، وتغيير حالة مع السبب.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold bg-white"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-bold flex items-center gap-2"><ShieldCheck size={14} /> مبدأ عدم التلاعب:</p>
        <p className="mt-1 leading-relaxed">الأحداث المالية تعرض من سجل تدقيق منفصل. التصحيح يكون بحدث جديد وليس بتعديل أو حذف الأثر القديم.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <select value={entityId} onChange={e => setEntityId(e.target.value)} className="border rounded-xl p-3 bg-white">
          <option value="">كل الكيانات</option>
          {entities.map(entity => <option key={entity.id} value={entity.id}>{entity.code} — {entity.name_ar}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-xl p-3 bg-white">
          <option value="">كل الأحداث</option>
          {eventTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل من finance_audit_event_board...</div> : (
        <div className="space-y-3">
          {events.map(event => (
            <div key={event.id} className="bg-white border rounded-2xl p-5 hover:border-slate-300 transition">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded-lg font-bold">{event.event_type}</span>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-200">{event.entity_code}</span>
                    <span className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-full border border-violet-200">{event.aggregate_type}</span>
                  </div>
                  <p className="mt-3 text-slate-800 leading-relaxed">{event.entity_name} · {event.aggregate_id.slice(0, 8)}</p>
                  <p className="mt-2 text-xs text-slate-500 line-clamp-2">{summarizeAfter(event.after_data)}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock size={12} />{new Date(event.created_at).toLocaleString('ar-EG')}</span>
                    <span className="flex items-center gap-1"><User size={12} />{event.actor_name || event.actor_email || event.actor_id?.slice(0, 8) || 'system'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!events.length && <div className="bg-white border border-dashed rounded-2xl p-16 text-center"><FileText className="mx-auto text-slate-300 mb-3" size={36} /><p className="font-bold text-slate-700">لا توجد أحداث تدقيق</p><p className="text-sm text-slate-400 mt-1">ستظهر العمليات المالية المهمة هنا بعد تطبيق migration وتشغيل التدفقات.</p></div>}
        </div>
      )}
    </div>
  );
}

function summarizeAfter(data?: Record<string, unknown> | null) {
  if (!data) return 'لا توجد بيانات إضافية.';
  const reason = data.reason;
  if (typeof reason === 'string' && reason.trim()) return `السبب: ${reason}`;
  return JSON.stringify(data).slice(0, 180);
}
