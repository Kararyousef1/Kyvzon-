/**
 * DocumentsPage - إدارة مستندات الموظفين (HR)
 */
import { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Loader2, Download, Upload, X } from 'lucide-react';
import { storageService } from '../../services/sdk/StorageService';
import { useUIStore } from '../../core/stores';
import { employeeDocumentService, employeeService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { EmployeeDocument, DocumentType } from '../../shared/types/hrModules';
import { DOCUMENT_TYPE_LABELS } from '../../shared/types/hrModules';
import { Modal, FormField, ModalActions, EmployeePicker } from './LoansPage';

export default function DocumentsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<EmployeeDocument[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [filterType, setFilterType] = useState<'all' | DocumentType>('all');
  const [form, setForm] = useState({
    employee_id: '', document_type: 'contract' as DocumentType,
    title: '', description: '', file_url: '', file_name: '',
    expires_at: '',
  });

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeDocumentService.findAll({ orderBy: 'created_at', ascending: false });
      const employees = await employeeService.findAll({ orderBy: 'full_name_ar' });
      const empMap = new Map((employees || []).map((e: any) => [e.id, e]));
      const enriched = (data || []).map((d: any) => ({ ...d, employees: empMap.get(d.employee_id) || null }));
      setDocs(enriched as unknown as EmployeeDocument[]);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setForm({ ...form, file_name: file.name, file_url: 'uploading...' });
      const url = await storageService.uploadPublic(
        'employee-documents',
        'employee-docs',
        file,
      );
      setForm({ ...form, file_name: file.name, file_url: url });
      addToast('تم رفع الملف بنجاح', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
      setForm({ ...form, file_name: '', file_url: '' });
    }
  };

  const handleCreate = async () => {
    if (!form.employee_id || !form.title || !form.file_url || form.file_url === 'uploading...') {
      addToast('يرجى اختيار موظف وعنوان وملف', 'warning');
      return;
    }
    try {
      await employeeDocumentService.createDocument({
        employee_id: form.employee_id,
        document_type: form.document_type,
        title: form.title,
        description: form.description,
        file_url: form.file_url,
        file_name: form.file_name,
        expires_at: form.expires_at || null,
      } as unknown as Record<string, unknown>);
      addToast('تم رفع المستند بنجاح', 'success');
      setShowCreate(false);
      setForm({ employee_id: '', document_type: 'contract', title: '', description: '', file_url: '', file_name: '', expires_at: '' });
      await fetchDocs();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleDelete = async (doc: EmployeeDocument) => {
    if (!confirm(`حذف "${doc.title}"؟`)) return;
    try {
      await employeeDocumentService.deleteDocument(doc.id);
      addToast('تم الحذف', 'success');
      await fetchDocs();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const filtered = filterType === 'all' ? docs : docs.filter((d) => d.document_type === filterType);
  const typeColors: Record<string, string> = {
    contract: '#6366f1', certificate: '#10b981', id_copy: '#f59e0b',
    cv: '#8b5cf6', medical: '#ef4444', degree: '#06b6d4', recommendation: '#ec4899', other: '#64748b',
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <FileText className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">مستندات الموظفين</h1>
            <p className="text-sm text-slate-500">إدارة العقود والشهادات والملفات</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-semibold transition-colors shadow-sm">
          <Plus size={18} /> مستند جديد
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'contract', 'certificate', 'id_copy', 'cv', 'medical', 'degree', 'other'] as const).map((t) => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${filterType === t ? 'bg-cyan-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
            {t === 'all' ? 'الكل' : DOCUMENT_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20"><Loader2 className="animate-spin text-cyan-500" size={40} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16"><FileText size={40} className="mx-auto text-slate-300 mb-3" /><p className="text-slate-500">لا توجد مستندات</p></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((doc) => {
            const emp = (doc as any).employees;
            const color = typeColors[doc.document_type] || '#64748b';
            return (
              <div key={doc.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}22` }}>
                    <FileText size={20} style={{ color }} />
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: `${color}22`, color }}>
                    {DOCUMENT_TYPE_LABELS[doc.document_type]}
                  </span>
                </div>
                <p className="font-bold text-slate-900 mb-1 truncate">{doc.title}</p>
                <p className="text-xs text-slate-500 mb-2">{emp?.full_name_ar || 'موظف'}</p>
                {doc.expires_at && (
                  <p className="text-xs text-amber-600 mb-2">ينتهي: {format(new Date(doc.expires_at), 'd MMM yyyy', { locale: ar })}</p>
                )}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  {doc.file_url && (
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100">
                      <Download size={14} /> عرض
                    </a>
                  )}
                  <button onClick={() => handleDelete(doc)}
                    className="px-2 py-1.5 bg-red-50 text-red-700 rounded-lg text-xs font-semibold hover:bg-red-100">
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="مستند جديد" onClose={() => setShowCreate(false)}>
          <EmployeePicker value={form.employee_id} onChange={(id) => setForm({ ...form, employee_id: id })} />
          <FormField label="نوع المستند" required>
            <select value={form.document_type}
              onChange={(e) => setForm({ ...form, document_type: e.target.value as DocumentType })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500">
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FormField>
          <FormField label="العنوان" required>
            <input type="text" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500" />
          </FormField>
          <FormField label="الوصف">
            <textarea value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="الملف" required>
            <label className="flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-cyan-500 transition-colors">
              <Upload size={18} className="text-slate-400" />
              <span className="text-sm text-slate-600">{form.file_name || 'اختر ملف...'}</span>
              <input type="file" className="hidden" onChange={handleFile} />
            </label>
          </FormField>
          <FormField label="تاريخ الانتهاء">
            <input type="date" value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <ModalActions onClose={() => setShowCreate(false)} onSubmit={handleCreate} submitLabel="رفع" color="blue" />
        </Modal>
      )}
    </div>
  );
}
