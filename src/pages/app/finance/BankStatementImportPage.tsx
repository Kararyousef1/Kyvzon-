import { useCallback, useEffect, useState } from 'react';
import { Landmark, Loader2, Plus, RefreshCw, Search, Upload, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { bankAccountService, bankStatementImportService, type BankAccountRecord, type BankStatementImportRecord } from '../../../services/sdk/BankStatementImportService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function BankStatementImportPage() {
  const { addToast } = useUIStore();
  const [accounts, setAccounts] = useState<BankAccountRecord[]>([]);
  const [imports, setImports] = useState<BankStatementImportRecord[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [loading, setLoading] = useState(true);
  const [filePath, setFilePath] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const acc = await bankAccountService.findAll({ orderBy: 'account_name' }) as any;
      setAccounts(acc || []);
      const id = selectedAccount || (acc && acc[0]?.id) || '';
      if (!selectedAccount && id) setSelectedAccount(id);
      if (id) {
        setImports(await bankStatementImportService.findForAccount(id));
      }
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, selectedAccount]);

  useEffect(() => { void load(); }, [load]);

  const handleImport = async () => {
    if (!selectedAccount || !filePath) {
      addToast('اختر حساباً ومسار ملف', 'error');
      return;
    }
    try {
      await bankStatementImportService.importStatement({
        bank_account_id: selectedAccount,
        file_path: filePath,
        import_date: new Date().toISOString().slice(0,10),
        status: 'pending',
        total_imported: 0,
        total_matched: 0,
      } as any);
      addToast('تم إنشاء الاستيراد — سيتم معالجته', 'success');
      setFilePath('');
      await load();
    } catch (e) {
      addToast(getErrorMessage(e), 'error');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-700">Bank — Wave 5 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">استيراد كشوف بنكية</h1>
          <p className="text-slate-500 mt-2">استيراد CSV مع فحص idempotent (منع تكرار نفس الملف) + حالة المعالجة.</p>
        </div>
        <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 flex gap-2">
        <FileText size={16} className="shrink-0 mt-0.5" />
        <div><p className="font-bold">Idempotency:</p><p className="mt-1">النظام يمنع استيراد نفس file_path مرتين — إذا حاولت، سيرفض بـ "تم استيراده مسبقاً". هذا يمنع تكرار البيانات.</p></div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)} className="border rounded-xl p-3 bg-white">
          <option value="">اختر حساباً بنكياً</option>
          {accounts.map(a => <option value={a.id} key={a.id}>{a.bank_name} — {a.account_name} ({a.currency})</option>)}
        </select>
        <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="مسار الملف مثل /uploads/bank-2026-07.csv" className="border rounded-xl p-3" dir="ltr" />
        <button onClick={() => void handleImport()} disabled={!selectedAccount || !filePath} className="bg-emerald-600 text-white rounded-xl px-4 py-3 font-bold disabled:opacity-50 flex items-center justify-center gap-2"><Upload size={15} /> استيراد</button>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">الملف</th><th className="p-3 text-right">الحالة</th><th className="p-3 text-right">مستورد</th><th className="p-3 text-right">مطابق</th></tr></thead>
            <tbody className="divide-y">
              {imports.map(i => <tr key={i.id}><td className="p-3">{i.import_date}</td><td className="p-3 font-mono text-xs truncate max-w-[200px]">{i.file_path || '—'}</td><td className="p-3"><span className={`px-2 py-1 rounded-full text-xs font-bold border ${i.status === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : i.status === 'failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{i.status}</span></td><td className="p-3">{i.total_imported}</td><td className="p-3">{i.total_matched}</td></tr>)}
              {!imports.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><Landmark className="mx-auto mb-3 text-slate-300" />لا توجد عمليات استيراد لهذا الحساب — أضف مسار ملف.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
