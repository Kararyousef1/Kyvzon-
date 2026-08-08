/**
 * DocumentsPage — مستندات الموظفين (HR) · migration 0360
 *
 * ★★★ أُعيدت كتابتها بعد إثبات اثني عشر عطلاً تشغيلياً على Postgres 17
 *     (المسبار: tools/dev/_probe_0360.sql). أبرزها:
 *
 *  ① **الموظف كان يقرأ ملفّه الطبّي السرّي** — `is_confidential` عمودٌ
 *     ميت لا تذكره أيّ سياسة (PROBE_6 = صفر). صار محجوباً في RLS
 *     وفي `employee_documents_board` معاً، وقابلاً للإدارة من الواجهة.
 *  ② **`document_type` بلا قيد** — `'ThIsIsGaRbAgE'` كان يدخل فتظهر
 *     شارةٌ فارغة (`DOCUMENT_TYPE_LABELS[type]` = `undefined`).
 *  ③/④ **`employee_id` بلا FK** — وثيقةٌ لموظف معدوم أو لموظف **شركةٍ
 *     أخرى** كانت تُقبَل. صار FK مركَّباً `(employee_id, tenant_id)`.
 *  ⑥ **الأرشفة لم تكن تُخفي شيئاً** — `findAll` بلا فلتر `is_archived`
 *     (PROBE_7) ⇒ الزرّ يقول «تمت الأرشفة» ولا يتغيّر شيء. الآن
 *     تبويبان: النشط والأرشيف.
 *  ⑦ **الحذف النهائيّ كان ممكناً** بدور `authenticated` رغم أن الصفحة
 *     تخلّت عنه (PROBE_8) — محفّز `DOCUMENT_DELETE_BLOCKED` يسدّه.
 *  ⑧ **`uploaded_by` لم يُكتب أبداً** — الآن يُملأ في القاعدة ويُعرض.
 *  ⑨ **`file_size`/`mime_type` مُهمَلان** رغم أن `File` يحملهما.
 *  ⑩ **«ينتهي: …» كانت تُطبع كهرمانيّة حتى لو انتهت أمس** — الآن حالة
 *     محسوبة في القاعدة بتوقيت بغداد: سارية · تقارب · منتهية.
 *  ⑪ ★★★ **bucket `'employee-documents'` غير موجود أصلاً** — النصّ
 *     يظهر في هذا الملف وحده ولا مايجريشن ينشئه ⇒ أوّل رفعٍ كان يرمي
 *     `Bucket not found`. و`uploadPublic` تعني رابطاً **عاماً بلا
 *     مصادقة** لتقارير طبّية. الآن `uploadPrivate` + رابطٌ موقَّت.
 *  ⑫ **حلقة O(n) في المتصفّح** و`orderBy:'full_name_ar'` على عمودٍ
 *     NULL لكل موظف ⇒ ترتيبٌ عشوائيّ. الآن استعلامٌ واحد مرتَّب حتمياً.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `employeeDocumentsSdk`.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileText, Plus, Loader2, Upload, Archive, Lock, Unlock,
  AlertTriangle, Clock, ShieldAlert, ExternalLink, Search, RotateCcw,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { archiveService } from '../../services/sdk/ArchiveService';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  employeeDocumentsSdk, DOCUMENT_TYPES, documentKindLabel, documentKindTone,
  expiryStateLabel, expiryStateTone, isAlwaysConfidential, MAX_DOCUMENT_BYTES,
} from '../../services/sdk';
import type {
  DocumentRow, DocumentsSummary, DocumentKind,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, EmployeePicker, DetailRow } from './LoansPage';

const EMPTY_FORM = {
  employeeId: '',
  kind: 'contract' as DocumentKind,
  title: '',
  description: '',
  filePath: '',
  fileName: '',
  fileSize: null as number | null,
  mimeType: '',
  expiresAt: '',
  confidential: false,
};

export default function DocumentsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [summary, setSummary] = useState<DocumentsSummary | null>(null);
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [filterKind, setFilterKind] = useState<'all' | DocumentKind>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<DocumentRow | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑫: استعلامٌ واحد بدل جلب كل الموظفين وبناء Map يدوياً
      const [board, sum] = await Promise.all([
        employeeDocumentsSdk.board(null, tab === 'archived'),
        employeeDocumentsSdk.summary().catch(() => null),
      ]);
      setRows(board);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, tab]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  /**
   * رفع الملف — إلى bucket **خاص** موجود فعلاً.
   *
   * ★★★ العطل ⑪: كان `uploadPublic('employee-documents', …)`:
   *   bucket غير موجود ⇒ `Bucket not found`، ورابطٌ عامّ دائم
   *   لتقارير طبّية لو وُجد.
   * ★ العطل ⑨: الحجم والنوع يُقرآن من `File` ويُخزَّنان.
   */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      addToast(
        `حجم الملف ${(file.size / 1048576).toFixed(1)}MB يتجاوز الحدّ 25MB`,
        'warning',
      );
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      const up = await employeeDocumentsSdk.uploadFile(file);
      setForm((f) => ({
        ...f,
        filePath: up.path,
        fileName: up.name,
        fileSize: up.size,
        mimeType: up.mimeType,
      }));
      addToast('تم رفع الملف', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
      setForm((f) => ({ ...f, filePath: '', fileName: '', fileSize: null, mimeType: '' }));
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.employeeId) { addToast('اختر الموظف', 'warning'); return; }
    if (!form.title.trim()) { addToast('العنوان مطلوب', 'warning'); return; }
    if (!form.filePath) { addToast('ارفع الملف أولاً', 'warning'); return; }
    setSaving(true);
    try {
      await employeeDocumentsSdk.create({
        employeeId:   form.employeeId,
        kind:         form.kind,
        title:        form.title.trim(),
        fileUrl:      form.filePath,
        fileName:     form.fileName || null,
        description:  form.description.trim() || null,
        fileSize:     form.fileSize,
        mimeType:     form.mimeType || null,
        expiresAt:    form.expiresAt || null,
        // ★ الطبّي والتوصية يُرفعان سرّيَّين في القاعدة مهما أُرسل
        confidential: form.confidential || isAlwaysConfidential(form.kind),
      });
      addToast('تم حفظ المستند', 'success');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * فتح الوثيقة برابطٍ موقَّت لساعة.
   *
   * ★ بديل `<a href={file_url}>` الذي كان يفترض رابطاً عاماً دائماً.
   */
  const handleOpen = async (row: DocumentRow) => {
    setBusyId(row.id);
    try {
      const url = await employeeDocumentsSdk.openUrl(row.fileUrl);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★ العطل ①: العمود الميت صار قابلاً للإدارة */
  const handleConfidential = async (row: DocumentRow, value: boolean) => {
    setBusyId(row.id);
    try {
      await employeeDocumentsSdk.setConfidential(row.id, value);
      addToast(value ? 'صارت سرّية' : 'رُفعت السرّية', 'success');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * أرشفة الوثيقة — لا حذف نهائي.
   *
   * ★★ العطل ⑦: محفّز `DOCUMENT_DELETE_BLOCKED` يمنع الحذف حتى من
   *   خارج الصفحة الآن — وثيقة الموظف (عقد · شهادة · إخلاء طرف)
   *   دليلٌ قد يُطلب بعد سنوات.
   */
  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const r = await archiveService.archiveEmployeeDocument(archiveTarget.id);
      addToast(r === 'already_archived' ? 'مؤرشفة أصلاً' : 'تمت الأرشفة', 'success');
      setArchiveTarget(null);
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setArchiving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterKind !== 'all' && r.kind !== filterKind) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q)
        || r.employeeName.toLowerCase().includes(q)
        || r.employeeCode.toLowerCase().includes(q)
      );
    });
  }, [rows, filterKind, search]);

  const fmtSize = (b: number | null): string =>
    b == null ? '—' : b >= 1048576
      ? `${(b / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(b / 1024))} KB`;

  const fmtDate = (d: string | null): string =>
    d ? format(new Date(d), 'd MMM yyyy', { locale: ar }) : '—';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <FileText className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">مستندات الموظفين</h1>
            <p className="text-sm text-slate-500">العقود والشهادات والوثائق الرسمية</p>
          </div>
        </div>
        <button
          onClick={() => { setForm({ ...EMPTY_FORM }); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
        >
          <Plus size={18} /> مستند جديد
        </button>
      </div>

      {/* ★ بطاقات مبنية على أرقام محسوبة في القاعدة */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatCard label="النشطة" value={summary.total} tone="slate" icon={<FileText size={16} />} />
          <StatCard label="سرّية" value={summary.confidential} tone="violet" icon={<Lock size={16} />} />
          <StatCard label="منتهية" value={summary.expired} tone="red" icon={<AlertTriangle size={16} />} />
          <StatCard label="تقارب الانتهاء" value={summary.expiring} tone="amber" icon={<Clock size={16} />} />
          <StatCard label="مؤرشفة" value={summary.archived} tone="cyan" icon={<Archive size={16} />} />
        </div>
      )}

      {/* ★★ العطل ⑧: أثرٌ قائم في البيانات — وثائق قديمة بلا رافع معروف */}
      {summary && summary.noUploader > 0 && (
        <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
          <ShieldAlert size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-amber-800 leading-relaxed">
            <b>{summary.noUploader}</b> وثيقة لا يُعرف مَن رفعها — سجلّات
            سابقة لعلاج <code className="text-xs">uploaded_by</code>. الوثائق
            الجديدة تُسجّل رافعها تلقائياً.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {(['active', 'archived'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t === 'active' ? 'النشطة' : 'الأرشيف'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالعنوان أو الموظف أو الرمز…"
            className="w-full pr-9 pl-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-cyan-500 focus:outline-none"
          />
        </div>
      </div>

      {/* ★ العطل ②: الشريط يعرض المفردات الثماني كاملة — كان يعرض سبعاً
          و`recommendation` مفقود فلا يمكن ترشيح خطاب التوصية أصلاً. */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <FilterChip active={filterKind === 'all'} onClick={() => setFilterKind('all')} label="الكل" />
        {DOCUMENT_TYPES.map((t) => (
          <FilterChip
            key={t}
            active={filterKind === t}
            onClick={() => setFilterKind(t)}
            label={documentKindLabel(t)}
          />
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-cyan-500" size={40} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">
            {tab === 'archived' ? 'لا مستندات مؤرشفة' : 'لا توجد مستندات'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${documentKindTone(doc.kind)}`}>
                  {documentKindLabel(doc.kind)}
                </span>
                <div className="flex items-center gap-1">
                  {doc.confidential && (
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-violet-50 text-violet-700 border-violet-200 flex items-center gap-1"
                      title="محجوبة عن الموظف"
                    >
                      <Lock size={11} /> سرّية
                    </span>
                  )}
                  {/* ★ العطل ⑩: الحالة محسوبة في القاعدة بتوقيت بغداد */}
                  {doc.expiryState !== 'none' && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${expiryStateTone(doc.expiryState)}`}>
                      {expiryStateLabel(doc.expiryState)}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setDetail(doc)}
                className="text-right font-bold text-slate-900 mb-1 truncate hover:text-cyan-700 transition-colors"
              >
                {doc.title}
              </button>
              <p className="text-xs text-slate-500 mb-1">
                {doc.employeeName}
                <span className="text-slate-400"> · {doc.employeeCode}</span>
              </p>

              {doc.expiresAt && (
                <p className={`text-xs mb-2 ${
                  doc.expiryState === 'expired' ? 'text-red-600 font-semibold' : 'text-slate-500'
                }`}>
                  {doc.expiryState === 'expired' ? 'انتهت في' : 'تنتهي في'}: {fmtDate(doc.expiresAt)}
                  {doc.daysLeft != null && (
                    <span className="text-slate-400">
                      {' '}({doc.daysLeft < 0
                        ? `منذ ${Math.abs(doc.daysLeft)} يوم`
                        : `بعد ${doc.daysLeft} يوم`})
                    </span>
                  )}
                </p>
              )}

              <div className="mt-auto flex gap-2 pt-3 border-t border-slate-100">
                <button
                  onClick={() => void handleOpen(doc)}
                  disabled={busyId === doc.id}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-100 disabled:opacity-50"
                >
                  {busyId === doc.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <ExternalLink size={14} />} فتح
                </button>

                {/* ★ العطل ①: الطبّي والتوصية مقفولان — نُعطّل الزرّ بدل
                    أن نُرسل نداءً نعرف أنه يرمي DOCUMENT_CONFIDENTIAL_LOCKED */}
                <button
                  onClick={() => void handleConfidential(doc, !doc.confidential)}
                  disabled={
                    busyId === doc.id
                    || (doc.confidential && isAlwaysConfidential(doc.kind))
                  }
                  title={
                    doc.confidential && isAlwaysConfidential(doc.kind)
                      ? `${documentKindLabel(doc.kind)} سرّيٌّ دائماً`
                      : doc.confidential ? 'رفع السرّية' : 'جعلها سرّية'
                  }
                  className="px-2 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-xs font-semibold hover:bg-violet-100 disabled:opacity-40"
                >
                  {doc.confidential ? <Unlock size={14} /> : <Lock size={14} />}
                </button>

                {!doc.isArchived && (
                  <button
                    onClick={() => setArchiveTarget(doc)}
                    title="أرشفة"
                    className="px-2 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold hover:bg-amber-100"
                  >
                    <Archive size={14} />
                  </button>
                )}
                {doc.isArchived && (
                  <span
                    title="مؤرشفة — لا تُحذف أبداً"
                    className="px-2 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-semibold flex items-center"
                  >
                    <RotateCcw size={14} />
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────── نافذة الإنشاء ─────────────── */}
      {showCreate && (
        <Modal title="مستند جديد" onClose={() => setShowCreate(false)}>
          <EmployeePicker
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <FormField label="نوع المستند" required>
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as DocumentKind })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500"
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>{documentKindLabel(t)}</option>
              ))}
            </select>
          </FormField>

          {/* ★ العطل ①: الطبّي والتوصية سرّيان تلقائياً — نُخبر لا نُفاجئ */}
          {isAlwaysConfidential(form.kind) && (
            <p className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg p-2.5 leading-relaxed flex items-start gap-2">
              <Lock size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                {documentKindLabel(form.kind)} يُحفظ <b>سرّياً دائماً</b> —
                محجوبٌ عن الموظف ولا يمكن رفع سرّيته لاحقاً.
              </span>
            </p>
          )}

          <FormField label="العنوان" required>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-500"
            />
          </FormField>
          <FormField label="الوصف">
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <FormField label="الملف" required>
            <label className="flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-cyan-500 transition-colors">
              {uploading
                ? <Loader2 size={18} className="text-cyan-500 animate-spin" />
                : <Upload size={18} className="text-slate-400" />}
              <span className="text-sm text-slate-600">
                {uploading ? 'جارٍ الرفع…' : form.fileName || 'اختر ملف… (حتى 25MB)'}
              </span>
              <input type="file" className="hidden" disabled={uploading} onChange={handleFile} />
            </label>
            {form.fileSize != null && (
              <p className="text-xs text-slate-500 mt-1">
                {fmtSize(form.fileSize)} · {form.mimeType || 'نوع غير معروف'}
              </p>
            )}
          </FormField>
          <FormField label="تاريخ الانتهاء">
            <input
              type="date"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
            <p className="text-xs text-slate-400 mt-1">
              اتركه فارغاً للوثائق التي لا تنتهي. التاريخ الماضي مرفوض.
            </p>
          </FormField>

          {!isAlwaysConfidential(form.kind) && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.confidential}
                onChange={(e) => setForm({ ...form, confidential: e.target.checked })}
                className="w-4 h-4 accent-violet-600"
              />
              <span className="text-sm text-slate-700">
                سرّية — محجوبة عن الموظف
              </span>
            </label>
          )}

          <ModalActions
            onClose={() => setShowCreate(false)}
            onSubmit={() => { if (!saving && !uploading) void handleCreate(); }}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'حفظ'}
            color="blue"
          />
        </Modal>
      )}

      {/* ─────────────── تفاصيل الوثيقة ─────────────── */}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <DetailRow label="الموظف" value={`${detail.employeeName} · ${detail.employeeCode}`} />
          <DetailRow label="النوع" value={documentKindLabel(detail.kind)} />
          <DetailRow label="الوصف" value={detail.description ?? undefined} />
          <DetailRow label="اسم الملف" value={detail.fileName || undefined} />
          <DetailRow label="الحجم" value={fmtSize(detail.fileSize)} />
          <DetailRow label="نوع المحتوى" value={detail.mimeType ?? undefined} />
          <DetailRow label="السرّية" value={detail.confidential ? 'سرّية' : 'عادية'} />
          <DetailRow
            label="الانتهاء"
            value={detail.expiresAt
              ? `${fmtDate(detail.expiresAt)} — ${expiryStateLabel(detail.expiryState)}`
              : 'بلا انتهاء'}
          />
          {/* ★ العطل ⑧: الرافع صار معروفاً */}
          <DetailRow label="رفعها" value={detail.uploaderName} />
          <DetailRow label="تاريخ الرفع" value={fmtDate(detail.createdAt)} />
          <DetailRow label="الحالة" value={detail.isArchived ? 'مؤرشفة' : 'نشطة'} />
        </Modal>
      )}

      {/* ★ تأكيد الأرشفة — Modal لا confirm() (سياسة المنصة) */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">تأكيد الأرشفة</h3>
            <p className="text-sm text-slate-700">
              أرشفة <b>«{archiveTarget.title}»</b>؟
            </p>
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
              الوثيقة تُؤرشَف ولا تُحذف — وثائق الموظف (عقد · شهادة ·
              إخلاء طرف) دليلٌ قد يُطلب بعد سنوات. الحذف النهائيّ ممنوع
              في القاعدة نفسها.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setArchiveTarget(null)}
                disabled={archiving}
                className="px-5 py-2.5 bg-white border rounded-xl font-bold text-sm disabled:opacity-50"
              >
                تراجع
              </button>
              <button
                onClick={() => void handleArchive()}
                disabled={archiving}
                className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
              >
                {archiving ? 'جارٍ…' : 'أرشفة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────

function StatCard({ label, value, tone, icon }: {
  label: string; value: number; tone: string; icon: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    slate:  'bg-slate-50 text-slate-700 border-slate-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    red:    'bg-red-50 text-red-700 border-red-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    cyan:   'bg-cyan-50 text-cyan-700 border-cyan-200',
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone] ?? tones.slate}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function FilterChip({ active, onClick, label }: {
  active: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        active
          ? 'bg-cyan-600 text-white'
          : 'bg-white text-slate-600 border border-slate-200 hover:border-cyan-300'
      }`}
    >
      {label}
    </button>
  );
}
