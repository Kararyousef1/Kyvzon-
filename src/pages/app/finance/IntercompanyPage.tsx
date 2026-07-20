import { useCallback, useEffect, useState } from 'react';
import { Repeat, Loader2, RefreshCw, CheckCircle, Clock } from 'lucide-react';
import { intercompanyService } from '../../../services/sdk/IntercompanyService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function IntercompanyPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await intercompanyService.findPending() as any[]);
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-violet-700">Intercompany — Wave 3 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">المعاملات البينية</h1>
          <p className="text-slate-500 mt-2">معاملات due-to/due-from بين كيانات، matching، و elimination — من intercompany_transactions.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">النوع</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">العملة</th><th className="p-3 text-right">المرجع</th><th className="p-3 text-right">الحالة</th></tr></thead>
            <tbody className="divide-y">
              {rows.map(r => <tr key={r.id}><td className="p-3 font-bold">{r.transaction_type}</td><td className="p-3 font-black">{Number(r.amount).toLocaleString()}</td><td className="p-3">{r.currency}</td><td className="p-3 font-mono text-xs">{r.reference || '—'}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold border ${r.status==='matched' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{r.status}</span></td></tr>)}
              {!rows.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><Repeat className="mx-auto mb-3 text-slate-300" />لا توجد معاملات بينية معلقة.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
