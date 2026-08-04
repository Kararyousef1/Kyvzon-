import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  procurementAuditService,
  type ProcurementAuditEventRecord,
} from '../../../../services/sdk/Procurement/ProcurementFoundationService';
import { getErrorMessage } from '../../../../services/errors';
import { useUIStore } from '../../../../core/stores';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

const AGGREGATE_LABELS: Record<string, string> = {
  spend_category: 'فئة إنفاق',
  approval_rule: 'قاعدة موافقة',
  procurement_policy: 'سياسة',
  supplier: 'مورد',
  purchase_requisition: 'طلب شراء',
  purchase_order: 'أمر شراء',
  goods_receipt: 'استلام بضاعة',
  invoice: 'فاتورة',
  contract: 'عقد',
};

export default function ProcurementAuditPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<ProcurementAuditEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await procurementAuditService.findRecent(200, typeFilter || undefined));
    } catch (e) {
      addToast(`تعذر تحميل سجل التدقيق: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.event_type.toLowerCase().includes(q) ||
      (r.actor_name || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const aggregateTypes = useMemo(
    () => Array.from(new Set(rows.map(r => r.aggregate_type))),
    [rows],
  );

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="foundation" />

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-amber-700">Procurement Foundation</p>
          <h1 className="text-3xl font-black">سجل التدقيق</h1>
          <p className="text-slate-500 mt-2">
            كل تغيير في المشتريات مسجَّل: من نفّذه، متى، ولماذا. السجل غير قابل للتعديل.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="border rounded-xl px-4 py-2 font-bold hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={15} className="inline ml-1" />تحديث
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="relative md:col-span-2">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ابحث بالحدث أو الفاعل أو السبب…"
            className="w-full border rounded-xl p-3 pr-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border rounded-xl p-3 bg-white"
        >
          <option value="">كل الأنواع</option>
          {aggregateTypes.map(t => (
            <option key={t} value={t}>{AGGREGATE_LABELS[t] ?? t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…</div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">الحدث</th>
                <th className="p-3 text-right">النوع</th>
                <th className="p-3 text-right">الفاعل</th>
                <th className="p-3 text-right">السبب</th>
                <th className="p-3">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(row => (
                <>
                  <tr key={row.id}>
                    <td className="p-3 text-slate-500 whitespace-nowrap text-xs">
                      {new Date(row.created_at).toLocaleString('ar')}
                    </td>
                    <td className="p-3 font-mono text-xs font-semibold">{row.event_type}</td>
                    <td className="p-3">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 font-semibold">
                        {AGGREGATE_LABELS[row.aggregate_type] ?? row.aggregate_type}
                      </span>
                    </td>
                    <td className="p-3">{row.actor_name || <span className="text-slate-400">نظام</span>}</td>
                    <td className="p-3 text-slate-600">
                      {row.reason || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        className="text-blue-700 font-bold text-xs hover:underline"
                      >
                        {expanded === row.id ? 'إخفاء' : 'عرض'}
                      </button>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr key={`${row.id}-detail`} className="bg-slate-50">
                      <td colSpan={6} className="p-4">
                        <div className="grid md:grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-bold text-slate-600 mb-1">قبل</p>
                            <pre className="text-[11px] bg-white border rounded-xl p-3 overflow-x-auto max-h-56" dir="ltr">
                              {row.before_data ? JSON.stringify(row.before_data, null, 2) : '—'}
                            </pre>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-600 mb-1">بعد</p>
                            <pre className="text-[11px] bg-white border rounded-xl p-3 overflow-x-auto max-h-56" dir="ltr">
                              {row.after_data ? JSON.stringify(row.after_data, null, 2) : '—'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-slate-500">
                    <ClipboardList className="mx-auto mb-3 text-slate-300" size={32} />
                    لا توجد أحداث مسجّلة بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
