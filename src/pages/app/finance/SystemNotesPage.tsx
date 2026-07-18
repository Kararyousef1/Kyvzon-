import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, RefreshCw, ShieldCheck, Clock, User } from 'lucide-react';
import { systemNoteService } from '../../../services/sdk/SystemNoteService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function SystemNotesPage() {
  const { addToast } = useUIStore();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await systemNoteService.findAll({ orderBy: 'timestamp', ascending: false, limit: 100 }) as any[];
      setNotes(rows);
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = filterType ? notes.filter(n => n.entity_type === filterType) : notes;

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-slate-700 flex items-center gap-2"><ShieldCheck size={14} /> System Notes — Wave 2 (Beta) — Immutable Audit ✅</p>
          <h1 className="text-3xl font-black">ملاحظات النظام المالية</h1>
          <p className="text-slate-500 mt-2">سجل غير قابل للتعديل — كل ملاحظة تُسجل وتبقى للأبد (RLS: لا DELETE). مبدأ Square Books.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
        <p className="font-bold flex items-center gap-2"><ShieldCheck size={14} /> مبدأ عدم التعديل (Immutability):</p>
        <p className="mt-1 leading-relaxed">لا يمكن تعديل أو حذف أي ملاحظة — حتى من admin. إذا احتجت تصحيحاً، أضف ملاحظة جديدة تشير إلى السابقة. هذا يضمن audit trail غير قابل للتلاعب.</p>
      </div>

      <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-xl p-3 bg-white max-w-xs">
        <option value="">كل الأنواع</option>
        <option value="journal_entry">قيود يومية</option>
        <option value="legal_entity">كيانات قانونية</option>
        <option value="vendor">موردون</option>
        <option value="customer">عملاء</option>
        <option value="budget">موازنات</option>
      </select>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل من system_notes عبر SDK...</div> : (
        <div className="space-y-3">
          {filtered.map(n => (
            <div key={n.id} className="bg-white border rounded-2xl p-5 hover:border-slate-300 transition">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-1 rounded-lg font-bold">{n.entity_type}</span>
                    <span className="text-xs text-slate-500 font-mono">{n.entity_id?.slice(0,8)}</span>
                    <span className="text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-full border border-violet-200">Immutable ✅</span>
                  </div>
                  <p className="mt-3 text-slate-800 leading-relaxed">{n.note_content}</p>
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Clock size={12} />{new Date(n.timestamp).toLocaleString('ar-EG')}</span>
                    <span className="flex items-center gap-1"><User size={12} />{n.user_id?.slice(0,8) || 'system'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!filtered.length && <div className="bg-white border border-dashed rounded-2xl p-16 text-center"><FileText className="mx-auto text-slate-300 mb-3" size={36} /><p className="font-bold text-slate-700">لا توجد ملاحظات</p><p className="text-sm text-slate-400 mt-1">الملاحظات تُنشأ تلقائياً عند كل عملية مالية مهمة — audit trail.</p></div>}
        </div>
      )}
    </div>
  );
}
