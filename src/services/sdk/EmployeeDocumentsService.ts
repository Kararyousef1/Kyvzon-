/**
 * ════════════════════════════════════════════════════════════════
 *  EmployeeDocumentsService — مستندات الموظفين (migration 0360)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0360.sql):
 *
 *  ① **`is_confidential` عمودٌ ميت — والموظف يقرأ ملفّه السرّي.**
 *     العمود موجود منذ `0006_hr_expansion.sql:459`، وسياسة القراءة
 *     القائمة لا تذكره إطلاقاً.
 *     PROBE_6: سياسات تذكره = 0 · دوال تذكره = 0
 *     ⇒ التقرير الطبيّ وخطاب التوصية السرّي يقرؤهما الموظف نفسه.
 *
 *  ② **`document_type` بلا أي قيد.** PROBE_1: `'ThIsIsGaRbAgE'` قُبِل.
 *     وأثره مباشر: `DOCUMENT_TYPE_LABELS[type]` = `undefined` ⇒ شارةٌ
 *     فارغة وصفٌّ غير قابل للتصنيف.
 *
 *  ③ **`employee_id` بلا FK.** PROBE_3: وثيقة لموظف `ffffffff-…` قُبِلت.
 *  ④ **وثيقةٌ لموظف مستأجرٍ آخر.** PROBE_4: `tenant_id = ألف` مع
 *     `employee_id` من **باء** ⇒ قُبِلت.
 *  ⑤ **`tenant_id` يقبل NULL** ⇒ صفٌّ يتيم لا يراه أحد (PROBE_2).
 *  ⑥ **الأرشفة لا تُخفي.** PROBE_7: بعد الأرشفة الصفحة ما زالت تراها.
 *  ⑦ **الحذف النهائيّ ممكن.** PROBE_8: بدور `authenticated` حقيقيّ
 *     `DELETE` نجح — والصفحة تخلّت عنه لكن الباب الخلفيّ مفتوح.
 *  ⑧ **`uploaded_by` لا يُكتب أبداً.** PROBE_5: 4 وثائق ⇒ 4 بلا رافع.
 *  ⑨ **`file_size`/`mime_type` ميتان.** الصفحة تملك `File` وترميهما.
 *  ⑩ **`expires_at` بلا أثر.** PROBE_10 = 0 دوال ⇒ «ينتهي: …» تُطبع
 *     كهرمانيّة حتى لو انتهت أمس.
 *  ⑪ **bucket `'employee-documents'` غير موجود** — النصّ يظهر في ملف
 *     واحد هو الصفحة، ولا مايجريشن ينشئه (0005 ينشئ `tawathul` وحده)
 *     ⇒ أوّل رفعٍ يرمي `Bucket not found`. ★★ و`uploadPublic` تعني
 *     رابطاً **عاماً بلا مصادقة** لتقارير طبّية — خطأٌ بنيويّ.
 *     ⇒ العلاج هنا: `DOCUMENTS_BUCKET = 'tawathul'` (الموجود فعلاً)
 *       و`uploadPrivate` + `signedUrl` بدل الرابط العام.
 *  ⑫ **حلقة O(n) في المتصفّح** و`orderBy:'full_name_ar'` على عمودٍ
 *     NULL لكل موظف ⇒ ترتيبٌ عشوائيّ فعلياً.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError, SdkErrorCode } from './BaseService';
import { storageService } from './StorageService';

/** ★ المفردات الثماني — مطابِقة لـ`employee_documents_type_chk` */
export const DOCUMENT_TYPES = [
  'contract', 'certificate', 'id_copy', 'cv',
  'medical', 'degree', 'recommendation', 'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_TYPES)[number];

/** ★ حالة الانتهاء — تُحسب في القاعدة بتوقيت بغداد لا في المتصفّح */
export const EXPIRY_STATES = ['none', 'valid', 'expiring', 'expired'] as const;
export type ExpiryState = (typeof EXPIRY_STATES)[number];

export const DOCUMENT_KIND_AR: Record<DocumentKind, string> = {
  contract:       'عقد عمل',
  certificate:    'شهادة',
  id_copy:        'نسخة هوية',
  cv:             'السيرة الذاتية',
  medical:        'تقرير طبي',
  degree:         'شهادة علمية',
  recommendation: 'خطاب توصية',
  other:          'مستند آخر',
};

export const DOCUMENT_KIND_TONE: Record<DocumentKind, string> = {
  contract:       'bg-indigo-50 text-indigo-700 border-indigo-200',
  certificate:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  id_copy:        'bg-amber-50 text-amber-700 border-amber-200',
  cv:             'bg-violet-50 text-violet-700 border-violet-200',
  medical:        'bg-red-50 text-red-700 border-red-200',
  degree:         'bg-cyan-50 text-cyan-700 border-cyan-200',
  recommendation: 'bg-pink-50 text-pink-700 border-pink-200',
  other:          'bg-slate-100 text-slate-600 border-slate-200',
};

export const EXPIRY_STATE_AR: Record<ExpiryState, string> = {
  none:     'بلا انتهاء',
  valid:    'سارية',
  expiring: 'تقارب الانتهاء',
  expired:  'منتهية',
};

export const EXPIRY_STATE_TONE: Record<ExpiryState, string> = {
  none:     'bg-slate-100 text-slate-600 border-slate-200',
  valid:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  expiring: 'bg-amber-50 text-amber-700 border-amber-200',
  expired:  'bg-red-50 text-red-700 border-red-200',
};

/**
 * ★★ الأنواع التي لا تُنزع سرّيتها — مطابِقة لحارس
 *    `DOCUMENT_CONFIDENTIAL_LOCKED` في `document_set_confidential`.
 */
export const ALWAYS_CONFIDENTIAL: readonly DocumentKind[] =
  ['medical', 'recommendation'] as const;

export const isAlwaysConfidential = (t: string): boolean =>
  (ALWAYS_CONFIDENTIAL as readonly string[]).includes(t);

export const documentKindLabel = (t: string): string =>
  DOCUMENT_KIND_AR[t as DocumentKind] ?? t;
export const documentKindTone = (t: string): string =>
  DOCUMENT_KIND_TONE[t as DocumentKind]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';
export const expiryStateLabel = (s: string): string =>
  EXPIRY_STATE_AR[s as ExpiryState] ?? s;
export const expiryStateTone = (s: string): string =>
  EXPIRY_STATE_TONE[s as ExpiryState]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';

/**
 * ★★★ العطل ⑪: الـbucket المستعمل.
 *
 *   `'employee-documents'` **غير موجود** — مسحُ المستودع كلّه أظهر
 *   النصّ في `DocumentsPage.tsx` وحده، و`0005_tawathul_rls_features.sql`
 *   ينشئ `'tawathul'` فقط. أوّل رفعٍ كان سيرمي `Bucket not found`.
 */
export const DOCUMENTS_BUCKET = 'tawathul';
export const DOCUMENTS_FOLDER = 'employee-documents';

/** ★ حدّ الحجم — مطابِق لـ`employee_documents_size_chk` (25MB) */
export const MAX_DOCUMENT_BYTES = 26214400;

export interface DocumentRow {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  kind: DocumentKind | string;
  title: string;
  description: string | null;
  /** ★ مسارٌ داخليّ في bucket خاص — لا رابط عام (العطل ⑪) */
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  confidential: boolean;
  expiresAt: string | null;
  expiryState: ExpiryState | string;
  /** موجب = باقٍ · سالب = منقضٍ · `null` = بلا تاريخ */
  daysLeft: number | null;
  uploadedBy: string | null;
  uploaderName: string;
  isArchived: boolean;
  createdAt: string | null;
}

export interface DocumentsSummary {
  total: number;
  confidential: number;
  expired: number;
  expiring: number;
  archived: number;
  /** ★ أثر العطل ⑧ القائم في البيانات: وثائق لا يُعرف رافعها */
  noUploader: number;
}

export interface DocumentUploadInput {
  employeeId: string;
  kind: DocumentKind;
  title: string;
  fileUrl: string;
  fileName?: string | null;
  description?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  expiresAt?: string | null;
  confidential?: boolean;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر» و«غير مُقاس» (درس 0353) */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

class EmployeeDocumentsSdk {
  /** ملخّص المستندات — محسوب في القاعدة (staff فقط) */
  async summary(): Promise<DocumentsSummary> {
    const { data, error } = await supabase.rpc('employee_documents_summary');
    if (error) {
      logger.error('employee_documents_summary فشل: ' + error.message, {
        component: 'EmployeeDocumentsSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      total:        num(r.out_total),
      confidential: num(r.out_confidential),
      expired:      num(r.out_expired),
      expiring:     num(r.out_expiring),
      archived:     num(r.out_archived),
      noUploader:   num(r.out_no_uploader),
    };
  }

  /**
   * لوح المستندات — استعلامٌ واحد.
   *
   * ★ العطل ⑫: النسخة السابقة جلبت كل الموظفين ثم بنت `Map` يدوياً
   *   في المتصفّح لكل عرض.
   * ★ العطل ⑥: `archived` يفصل النشط عن المؤرشف — كان الاستعلام بلا
   *   أيّ فلتر فتظهر المؤرشفة كأنّ شيئاً لم يكن.
   * ★ العطل ①: السرّي محجوب عن صاحبه — في الدالة **وفي RLS** معاً.
   */
  async board(kind?: DocumentKind | null, archived = false): Promise<DocumentRow[]> {
    const { data, error } = await supabase.rpc('employee_documents_board', {
      p_type:     kind ?? null,
      p_archived: archived,
    });
    if (error) {
      logger.error('employee_documents_board فشل: ' + error.message, {
        component: 'EmployeeDocumentsSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:           str(r.out_id),
      employeeId:   str(r.out_employee_id),
      employeeName: str(r.out_employee_name),
      employeeCode: str(r.out_employee_code),
      kind:         str(r.out_document_type),
      title:        str(r.out_title),
      description:  strOrNull(r.out_description),
      fileUrl:      str(r.out_file_url),
      fileName:     str(r.out_file_name),
      fileSize:     numOrNull(r.out_file_size),
      mimeType:     strOrNull(r.out_mime_type),
      confidential: Boolean(r.out_confidential),
      expiresAt:    strOrNull(r.out_expires_at),
      expiryState:  str(r.out_expiry_state),
      daysLeft:     numOrNull(r.out_days_left),
      uploadedBy:   strOrNull(r.out_uploaded_by),
      uploaderName: str(r.out_uploader_name),
      isArchived:   Boolean(r.out_is_archived),
      createdAt:    strOrNull(r.out_created_at),
    }));
  }

  /**
   * رفع الملف إلى التخزين — **خاص** لا عام.
   *
   * ★★★ العطل ⑪: النسخة السابقة نادت
   *     `storageService.uploadPublic('employee-documents', …)`
   *   وفيها خطآن: bucket غير موجود، ورابطٌ **عامّ بلا مصادقة**
   *   لتقارير طبّية وعقود. هنا `uploadPrivate` يعيد **مساراً داخلياً**
   *   ويُطلَب رابطٌ موقَّت عند الفتح عبر `signedUrl`.
   *
   * ★ العطل ⑨: الحجم والنوع يُقرآن من `File` ويُخزَّنان.
   */
  async uploadFile(file: File): Promise<{
    path: string; size: number; mimeType: string; name: string;
  }> {
    if (file.size <= 0) {
      throw new SdkError(SdkErrorCode.VALIDATION_ERROR, 'الملف فارغ');
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new SdkError(
        SdkErrorCode.VALIDATION_ERROR,
        `حجم الملف ${(file.size / 1048576).toFixed(1)}MB يتجاوز الحدّ 25MB`,
      );
    }
    const path = await storageService.uploadPrivate(
      DOCUMENTS_BUCKET, DOCUMENTS_FOLDER, file,
    );
    return {
      path,
      size: file.size,
      mimeType: file.type || 'application/octet-stream',
      name: file.name,
    };
  }

  /**
   * رابطٌ موقَّت لفتح الوثيقة (ساعة واحدة).
   *
   * ★ بديل الرابط العام الدائم: الوثائق لا تُقرأ إلا بجلسةٍ حيّة.
   */
  async openUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    return storageService.signedUrl(DOCUMENTS_BUCKET, path, expiresInSeconds);
  }

  /**
   * إنشاء سجلّ الوثيقة — نداءٌ واحد بحرّاس في القاعدة.
   *
   * ★ العطل ③/④: `DOCUMENT_EMPLOYEE_NOT_FOUND` إن لم يكن الموظف في
   *   المستأجر نفسه — وFK مركَّب يحرس حتى الكتابة المباشرة.
   * ★ العطل ⑧: `uploaded_by` يُملأ في القاعدة من `auth.uid()`
   *   ولا يُؤخذ من العميل (الانتحال مُبطَل — مُثبَت في سكربت RLS).
   */
  async create(input: DocumentUploadInput): Promise<string> {
    const { data, error } = await supabase.rpc('document_upload', {
      p_employee_id:  input.employeeId,
      p_type:         input.kind,
      p_title:        input.title,
      p_file_url:     input.fileUrl,
      p_file_name:    input.fileName ?? null,
      p_description:  input.description ?? null,
      p_file_size:    input.fileSize ?? null,
      p_mime_type:    input.mimeType ?? null,
      p_expires_at:   input.expiresAt ?? null,
      p_confidential: input.confidential ?? false,
    });
    if (error) {
      logger.error('document_upload فشل: ' + error.message, {
        component: 'EmployeeDocumentsSdk', action: 'create',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return str(data);
  }

  /**
   * ضبط سرّية الوثيقة — العمود الميت صار قابلاً للإدارة (العطل ①).
   *
   * ★★ الطبّي وخطاب التوصية لا تُنزع سرّيتهما:
   *    `DOCUMENT_CONFIDENTIAL_LOCKED`.
   */
  async setConfidential(documentId: string, value: boolean): Promise<boolean> {
    const { data, error } = await supabase.rpc('document_set_confidential', {
      p_document_id: documentId,
      p_value:       value,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return Boolean(data);
  }
}

export const employeeDocumentsSdk = new EmployeeDocumentsSdk();
export default employeeDocumentsSdk;
