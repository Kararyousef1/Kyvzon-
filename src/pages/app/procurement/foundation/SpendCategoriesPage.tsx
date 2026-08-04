import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import {
  spendCategoryService,
  type SpendCategoryTreeRecord,
} from '../../../../services/sdk/Procurement/ProcurementFoundationService';
import { getErrorMessage } from '../../../../services/errors';
import { useUIStore } from '../../../../core/stores';
import { ProcurementUnitNav } from '../shared/ProcurementUnitNav';

const LEVEL_LABELS: Record<number, string> = {
  1: 'قطاع', 2: 'فئة', 3: 'صنف', 4: 'منتج',
};

interface FormState {
  categoryId: string | null;
  code: string;
  nameAr: string;
  nameEn: string;
  level: number;
  parentId: string;
}

const EMPTY_FORM: FormState = {
  categoryId: null, code: '', nameAr: '', nameEn: '', level: 1, parentId: '',
};

export default function SpendCategoriesPage() {
  const { addToast } = useUIStore();
  const [rows, setRows] = useState<SpendCategoryTreeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [statusTarget, setStatusTarget] = useState<SpendCategoryTreeRecord | null>(null);
  const [statusReason, setStatusReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await spendCategoryService.findTree());
    } catch (e) {
      addToast(`تعذر تحميل الفئات: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.code.toLowerCase().includes(q) ||
      r.name_ar.toLowerCase().includes(q) ||
      (r.name_en || '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  // الآباء المتاحون: مستوى أقل بواحد من المستوى المختار، ونشطون
  const parentOptions = useMemo(
    () => rows.filter(r => r.is_active && r.level === form.level - 1),
    [rows, form.level],
  );

  const resetForm = () => setForm(EMPTY_FORM);

  const save = async () => {
    if (!form.code.trim() || !form.nameAr.trim()) {
      addToast('الرمز والاسم العربي مطلوبان', 'error');
      return;
    }
    if (form.level > 1 && !form.parentId) {
      addToast('الفئة تحت المستوى الأول تتطلب فئة أباً', 'error');
      return;
    }
    setSaving(true);
    try {
      await spendCategoryService.upsert({
        code: form.code.trim(),
        nameAr: form.nameAr.trim(),
        level: form.level,
        categoryId: form.categoryId,
        nameEn: form.nameEn.trim() || null,
        parentId: form.parentId || null,
      });
      addToast(form.categoryId ? 'تم تحديث الفئة' : 'تم إنشاء الفئة', 'success');
      resetForm();
      await load();
    } catch (e) {
      addToast(getErrorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: SpendCategoryTreeRecord) => {
    setForm({
      categoryId: row.id,
      code: row.code,
      nameAr: row.name_ar,
      nameEn: row.name_en || '',
      level: row.level,
      parentId: row.parent_id || '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmStatus = async () => {
    if (!statusTarget) return;
    if (!statusReason.trim()) {
      addToast('السبب مطلوب', 'error');
      return;
    }
    try {
      await spendCategoryService.setStatus(statusTarget.id, !statusTarget.is_active, statusReason.trim());
      addToast(statusTarget.is_active ? 'تم تعطيل الفئة' : 'تم تفعيل الفئة', 'success');
      setStatusTarget(null);
      setStatusReason('');
      await load();
    } catch (e) {
      addToast(getErrorMessage(e), 'error');
    }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <ProcurementUnitNav unit="foundation" />

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-amber-700">Procurement Foundation</p>
          <h1 className="text-3xl font-black">فئات الإنفاق</h1>
          <p className="text-slate-500 mt-2">
            تصنيف هرمي على أربعة مستويات (قطاع ← فئة ← صنف ← منتج) يُبنى عليه تحليل الإنفاق.
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

      {/* نموذج الإنشاء/التعديل */}
      <div className="bg-white border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-black flex items-center gap-2">
            <Layers size={18} className="text-amber-600" />
            {form.categoryId ? 'تعديل فئة' : 'فئة جديدة'}
          </h2>
          {form.categoryId && (
            <button type="button" onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-800">
              <X size={14} className="inline ml-1" />إلغاء التعديل
            </button>
          )}
        </div>

        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">الرمز *</label>
            <input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="50101900"
              className="w-full border rounded-xl p-2.5 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">الاسم بالعربية *</label>
            <input
              value={form.nameAr}
              onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
              placeholder="مواد غذائية"
              className="w-full border rounded-xl p-2.5"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">الاسم بالإنجليزية</label>
            <input
              value={form.nameEn}
              onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
              className="w-full border rounded-xl p-2.5"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">المستوى *</label>
            <select
              value={form.level}
              onChange={e => setForm(f => ({ ...f, level: Number(e.target.value), parentId: '' }))}
              className="w-full border rounded-xl p-2.5 bg-white"
            >
              {[1, 2, 3, 4].map(l => (
                <option key={l} value={l}>{l} — {LEVEL_LABELS[l]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">
              الفئة الأب {form.level > 1 ? '*' : '(لا يوجد)'}
            </label>
            <select
              value={form.parentId}
              onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))}
              disabled={form.level === 1}
              className="w-full border rounded-xl p-2.5 bg-white disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="">— اختر —</option>
              {parentOptions.map(p => (
                <option key={p.id} value={p.id}>{p.code} — {p.name_ar}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-4 bg-amber-600 text-white rounded-xl px-6 py-2.5 font-bold hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          <Plus size={15} className="inline ml-1" />
          {saving ? 'جارٍ الحفظ…' : form.categoryId ? 'حفظ التعديل' : 'إنشاء الفئة'}
        </button>
      </div>

      {/* البحث */}
      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالرمز أو الاسم…"
          className="w-full border rounded-xl p-3 pr-10"
        />
      </div>

      {/* الشجرة */}
      {loading ? (
        <div className="py-24 text-center">
          <Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل…
        </div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 text-right">المسار</th>
                <th className="p-3 text-right">الرمز</th>
                <th className="p-3">المستوى</th>
                <th className="p-3">الأبناء</th>
                <th className="p-3">المعاملات</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(row => (
                <tr key={row.id} className={row.is_active ? '' : 'bg-slate-50/60'}>
                  <td className="p-3">
                    <span style={{ paddingRight: `${(row.level - 1) * 16}px` }} className="inline-block">
                      {row.level > 1 && <span className="text-slate-300 ml-1">└</span>}
                      <span className="font-semibold">{row.name_ar}</span>
                      {row.name_en && <span className="text-slate-400 text-xs mr-2">{row.name_en}</span>}
                    </span>
                  </td>
                  <td className="p-3 font-mono font-bold text-slate-700">{row.code}</td>
                  <td className="p-3 text-center">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 font-semibold">
                      {LEVEL_LABELS[row.level] ?? row.level}
                    </span>
                  </td>
                  <td className="p-3 text-center text-slate-600">{row.child_count}</td>
                  <td className="p-3 text-center text-slate-600">{row.transaction_count}</td>
                  <td className="p-3 text-center">
                    {row.is_active ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">نشطة</span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600" title={row.deactivated_reason || ''}>
                        معطّلة
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => startEdit(row)}
                      className="text-blue-700 font-bold text-xs hover:underline ml-3"
                    >
                      تعديل
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStatusTarget(row); setStatusReason(''); }}
                      className={`font-bold text-xs hover:underline ${row.is_active ? 'text-rose-700' : 'text-emerald-700'}`}
                    >
                      {row.is_active ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="p-16 text-center text-slate-500">
                    <Layers className="mx-auto mb-3 text-slate-300" size={32} />
                    لا توجد فئات إنفاق. ابدأ بإنشاء قطاع (مستوى 1).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* نافذة تغيير الحالة — بديل confirm/prompt */}
      {statusTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-black text-lg mb-2">
              {statusTarget.is_active ? 'تعطيل فئة' : 'تفعيل فئة'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {statusTarget.code} — {statusTarget.name_ar}
            </p>
            <label className="block text-xs font-bold text-slate-600 mb-1">السبب *</label>
            <textarea
              value={statusReason}
              onChange={e => setStatusReason(e.target.value)}
              rows={3}
              placeholder="اذكر سبب التغيير — يُسجَّل في سجل التدقيق"
              className="w-full border rounded-xl p-3"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => void confirmStatus()}
                className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700"
              >
                تأكيد
              </button>
              <button
                type="button"
                onClick={() => { setStatusTarget(null); setStatusReason(''); }}
                className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
