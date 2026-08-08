/**
 * MovementRoleService — أدوار بوابة الحركة واللوجستيات
 *
 * ─────────────────────────────────────────────────────────────────────────
 * لماذا هذا الملف؟
 *   بوابة الحركة تحوي دورين منفصلين تماماً:
 *     employee_movement — حركة الموظفين (تصاريح · زيارات · امتثال)
 *     logistics         — الحركة واللوجستيات (أسطول · شحنات · تتبع)
 *   ودور ثالث `movement_manager` يشرف على الاثنين.
 *
 *   المتطلب: «كل دور يعرض وحداته وصفحاته الخاصة فقط».
 *
 *   قبل هذا الملف لم تكن هناك أي طبقة تقرأ الأدوار — أي أن الفصل
 *   كان معدوماً في الواجهة، وصاحب دور اللوجستيات يرى صفحات الموظفين
 *   والعكس. الحماية في قاعدة البيانات وحدها لا تكفي: المستخدم يصل
 *   للصفحة ثم تفشل الاستعلامات، وهذه تجربة سيئة لا حماية.
 *
 * الأمان: هذه الطبقة للعرض فقط (UX). الحماية الحقيقية في
 *   public.movement_require_role() داخل قاعدة البيانات + RLS.
 */
import { BaseService } from './BaseService';
import type { MovementRoleAssignmentRecord } from '../../shared/types/movement-foundation';

/** أدوار البوابة كما تسمح بها قاعدة البيانات (CHECK في 0270) */
export type MovementPortalRole =
  | 'employee_movement'
  | 'logistics'
  | 'movement_manager';

/** الدوران القابلان للعرض — movement_manager يمنحهما معاً */
export type MovementViewRole = 'employee_movement' | 'logistics';

class MovementRoleService extends BaseService<MovementRoleAssignmentRecord> {
  constructor() {
    super('movement_role_assignments');
  }

  /** إسنادات الدور النشطة للمستخدم الحالي (RLS تفلتر بالمستأجر) */
  async findMyAssignments(userId: string): Promise<MovementRoleAssignmentRecord[]> {
    if (!userId) return [];
    return this.findWhere(
      [
        { column: 'user_id', value: userId },
        { column: 'is_active', value: true },
      ],
      { orderBy: 'created_at', ascending: true },
    );
  }

  /**
   * الأدوار القابلة للعرض بعد توسيع movement_manager.
   * مثال: من يملك movement_manager يحصل على الدورين.
   */
  async findMyViewRoles(userId: string): Promise<MovementViewRole[]> {
    const rows = await this.findMyAssignments(userId);
    return MovementRoleService.expandRoles(
      rows.map((r) => r.portal_role as MovementPortalRole),
    );
  }

  /**
   * توسيع الأدوار الخام إلى أدوار عرض.
   * دالة صرفة (pure) — مُصدَّرة لتُختبر مباشرة بلا شبكة.
   */
  static expandRoles(raw: MovementPortalRole[]): MovementViewRole[] {
    const out = new Set<MovementViewRole>();
    for (const role of raw) {
      if (role === 'movement_manager') {
        out.add('employee_movement');
        out.add('logistics');
      } else if (role === 'employee_movement' || role === 'logistics') {
        out.add(role);
      }
    }
    // ترتيب ثابت: حركة الموظفين أولاً ثم اللوجستيات
    return (['employee_movement', 'logistics'] as MovementViewRole[]).filter((r) =>
      out.has(r),
    );
  }
}

export const movementRoleService = new MovementRoleService();
