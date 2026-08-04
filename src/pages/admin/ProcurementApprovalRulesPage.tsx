/**
 * ════════════════════════════════════════════════════════════════
 *  صفحة قواعد موافقات المشتريات (مسار إداري قديم)
 *
 *  أُعيد توجيهها إلى الصفحة المعتمدة داخل وحدة "الأساس والتحكم"
 *  في بوابة المشتريات:
 *      /app/procurement/foundation/approval-rules
 *
 *  سبب التوجيه:
 *   - النسخة القديمة كانت تستخدم BaseService مباشرة مع حذف نهائي
 *     (delete) و confirm() — وكلاهما مخالف لمبادئ المنصة.
 *   - النسخة المعتمدة تمر عبر RPCs مع تحقق وسبب إلزامي وسجل تدقيق،
 *     ولا تحذف نهائياً بل تعطّل.
 * ════════════════════════════════════════════════════════════════
 */

import { Navigate } from 'react-router-dom';

export default function ProcurementApprovalRulesPage() {
  return <Navigate to="/app/procurement/foundation/approval-rules" replace />;
}
