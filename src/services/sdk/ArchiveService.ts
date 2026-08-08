/**
 * ════════════════════════════════════════════════════════════════════════
 *  ArchiveService — الأرشفة بدل الحذف النهائي
 *
 *  ═══ الفجوة التي تسدّها (مُقاسة على قاعدة حقيقية) ═══════════════════
 *
 *  ① `AdminSOPsPage.tsx:263` كان يحذف إجراء التشغيل نهائياً:
 *        confirm(...) ثم supabase.from('sops').delete()
 *     و`sop_readings_sop_id_fkey ON DELETE CASCADE`.
 *
 *     مُقاس على Postgres:
 *        قبل الحذف : سجلات قراءة الإجراء = 1
 *        بعد الحذف : سجلات القراءة = 0    ← من قرأ الإجراء أُبيد
 *        بعد الأرشفة: سجلات القراءة = 1   (محفوظة)
 *
 *     سجل «من قرأ أي إجراء ومتى» دليل امتثال، وكان يُمحى بنقرة.
 *     و`sops.status` يقبل `'archived'` أصلاً — الأرشفة كانت متاحة
 *     ولم تُستعمل.
 *
 *  ② `OrgStructurePage.tsx:168` كان يَعِد بما لا يفعل:
 *        «حذف هذا القسم؟ سيتم إزالة ارتباطه بالموظفين والأقسام الفرعية»
 *     ثم يستدعي حذفاً نهائياً.
 *
 *     مُقاس: `departments_parent_department_id_fkey` يمنع الحذف أصلاً
 *     فتظهر «حدث خطأ أثناء الحذف» بلا سبب. ولو نجح لأباد
 *     `approval_rules` و`org_role_assignments` عبر `ON DELETE CASCADE`.
 *
 *  الدالتان في القاعدة (migration 0324) تُعيدان أسباباً مفهومة
 *  بدل رسائل القيود الخام.
 * ════════════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';

export type ArchiveSopResult = 'archived' | 'already_archived';

/** أسباب منع أرشفة القسم — تُترجَم لرسائل عربية للمستخدم */
export interface ArchiveBlockedReason {
  code: 'HAS_EMPLOYEES' | 'HAS_ACTIVE_CHILDREN' | 'NOT_AUTHORIZED' | 'UNKNOWN';
  message: string;
}

/** يحوّل خطأ القاعدة إلى سبب مفهوم بالعربية */
function parseArchiveError(raw: string): ArchiveBlockedReason {
  if (raw.includes('HAS_EMPLOYEES')) {
    const n = raw.match(/(\d+)\s*موظف/)?.[1];
    return {
      code: 'HAS_EMPLOYEES',
      message: n
        ? `لا يمكن أرشفة القسم: ${n} موظف ما زالوا مُسندين إليه. انقلهم أولاً.`
        : 'لا يمكن أرشفة القسم: فيه موظفون. انقلهم أولاً.',
    };
  }
  if (raw.includes('HAS_ACTIVE_CHILDREN')) {
    const n = raw.match(/(\d+)\s*قسم/)?.[1];
    return {
      code: 'HAS_ACTIVE_CHILDREN',
      message: n
        ? `لا يمكن أرشفة القسم: ${n} قسم فرعي نشط. أرشِفها أولاً.`
        : 'لا يمكن أرشفة القسم: له أقسام فرعية نشطة.',
    };
  }
  if (raw.includes('NOT_AUTHORIZED')) {
    return { code: 'NOT_AUTHORIZED', message: 'لا تملك صلاحية الأرشفة.' };
  }
  return { code: 'UNKNOWN', message: raw || 'تعذّرت الأرشفة.' };
}

class ArchiveService {
  /**
   * أرشفة إجراء تشغيل — سجلات القراءة تبقى (دليل امتثال).
   * @throws رسالة مفهومة عند الفشل
   */
  async archiveSop(sopId: string, reason?: string): Promise<ArchiveSopResult> {
    const { data, error } = await supabase.rpc('archive_sop', {
      p_sop_id: sopId,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(parseArchiveError(error.message).message);
    return data as ArchiveSopResult;
  }

  /**
   * أرشفة قسم — قواعد الاعتماد والإسنادات التنظيمية تبقى سليمة.
   * @throws رسالة مفهومة تشرح المانع
   */
  async archiveDepartment(departmentId: string): Promise<'archived'> {
    const { data, error } = await supabase.rpc('archive_department', {
      p_department_id: departmentId,
    });
    if (error) throw new Error(parseArchiveError(error.message).message);
    return data as 'archived';
  }

  /**
   * أرشفة وثيقة موظف — الوثيقة دليل قد يُطلب بعد سنوات.
   *
   * ★ `hr/DocumentsPage.tsx` كان يحذفها نهائياً بعد `confirm()`.
   */
  async archiveEmployeeDocument(documentId: string): Promise<ArchiveSopResult> {
    const { data, error } = await supabase.rpc('archive_employee_document', {
      p_document_id: documentId,
    });
    if (error) throw new Error(parseArchiveError(error.message).message);
    return data as ArchiveSopResult;
  }

  /** يفحص سبب المنع دون تنفيذ — للعرض في واجهة التأكيد */
  parseBlockedReason(raw: string): ArchiveBlockedReason {
    return parseArchiveError(raw);
  }
}

export const archiveService = new ArchiveService();
export default archiveService;
