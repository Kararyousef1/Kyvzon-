import { useCallback, useEffect, useState } from 'react';
import { FileCheck, Clock, AlertCircle, Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../../../services/supabase/supabase';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function ApprovalsPage() {
  const { addToast } = useUIStore();
  const [filter, setFilter] = useState('pending');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('financial_approval_requests').select('*').eq('status', filter).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, filter]);

  useEffect(() => { void load(); }, [load]);

  const handleDecision = async (id: string, decision: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase.from('financial_approval_requests').update({ status: decision, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      addToast(`تم ${decision === 'approved' ? 'الموافقة' : 'الرفض'}`, decision === 'approved' ? 'success' : 'info');
      await load();
    } catch (e) {
      addToast(getErrorMessage(e), 'error');
    }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-violet-700">Financial Approvals — Wave 2 (Beta) — Real SDK ✅</p>
          <h1 className="text-2xl font-black">سير الموافقات المالية</h1>
          <p className="text-slate-500">موافقات مالية منفصلة عن HR — ذرية، مع audit، حالات pending/approved/rejected.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      <div className="flex gap-2">
        {[{k:'pending',l:'معلقة',icon:Clock},{k:'approved',l:'موافق',icon:CheckCircle},{k:'rejected',l:'مرفوض',icon:XCircle}].map(({k,l,icon:Icon}) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-4 py-2 rounded-xl text-sm font-bold border flex items-center gap-2 ${filter===k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-600 border-slate-200'}`}><Icon size={14} />{l}</button>
        ))}
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل من financial_approval_requests...</div> : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.id} className="bg-white border rounded-2xl p-5 flex justify-between items-center">
              <div>
                <div className="flex items-center gap-2"><span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded-lg font-bold">{r.request_type}</span><span className="text-xs text-slate-400">{r.reference_id?.slice(0,8)}</span><span className="text-xs px-2 py-1 bg-amber-50 border border-amber-200 rounded-full font-bold">{r.status}</span></div>
                <p className="font-bold mt-2">الخطوة {r.current_step}/{r.total_steps}</p>
                <p className="text-xs text-slate-400 mt-1">{new Date(r.created_at).toLocaleString('ar-EG')}</p>
              </div>
              {filter==='pending' && <div className="flex gap-2"><button onClick={() => void handleDecision(r.id, 'approved')} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold">موافقة</button><button onClick={() => void handleDecision(r.id, 'rejected')} className="bg-white border px-4 py-2 rounded-xl text-sm font-bold">رفض</button></div>}
            </div>
          ))}
          {!rows.length && <div className="bg-white border border-dashed rounded-2xl p-16 text-center"><FileCheck className="mx-auto text-slate-300 mb-3" size={36} /><p className="font-bold text-slate-700">لا توجد موافقات {filter}</p><p className="text-sm text-slate-400 mt-1">الموافقات تُنشأ عند ترحيل قيود أو فواتير تحتاج اعتماد مالي منفصل.</p></div>}
        </div>
      )}
    </div>
  );
}
