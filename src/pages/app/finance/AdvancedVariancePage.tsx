import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../../../services/supabase/supabase';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function AdvancedVariancePage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('budget_variance_reports').select('*').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      setRows(data || []);
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
          <p className="text-sm font-bold text-indigo-700">Budget Variance — Wave 6 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">تحليل التباين المتقدم</h1>
          <p className="text-slate-500 mt-2">مقارنة فعلية مقابل موازنة مع نسبة تباين — من budget_variance_reports.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">الفترة</th><th className="p-3 text-right">موازنة</th><th className="p-3 text-right">فعلي</th><th className="p-3 text-right">التباين</th><th className="p-3 text-right">النسبة</th></tr></thead>
            <tbody className="divide-y">
              {rows.map(r => {
                const variance = Number(r.variance_amount);
                const Icon = variance >= 0 ? TrendingUp : TrendingDown;
                return <tr key={r.id}><td className="p-3">{r.report_period}</td><td className="p-3">{Number(r.budget_amount).toLocaleString()}</td><td className="p-3">{Number(r.actual_amount).toLocaleString()}</td><td className="p-3 font-black flex items-center gap-1"><Icon size={14} className={variance>=0 ? 'text-emerald-600' : 'text-red-600'} />{variance.toLocaleString()}</td><td className="p-3">{Number(r.variance_percentage).toFixed(2)}%</td></tr>;
              })}
              {!rows.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><BarChart3 className="mx-auto mb-3 text-slate-300" />لا توجد تقارير تباين — تُنشأ من Budget vs GL actual.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
