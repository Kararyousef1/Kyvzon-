/**
 * ApprovalTrail — عرض مسار الاعتماد متعدد المستويات
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الفجوة التي يسدّها:
 *
 *   0309 أنشأ unified_approval_steps و approval_steps_for()، و0310 جعل
 *   الجسور تبني السلسلة تلقائياً. لكن فحص الشيفرة أثبت **صفر استدعاء**
 *   لـ findSteps() في src/ — فالمعتمِد يرى «مستوى 2 من 3» كرقم مجرّد
 *   ولا يعرف من سبقه ولا من بعده ولا لماذا وافق الأول.
 *
 *   النتيجة العملية: المدير يوافق في فراغ. ولو رُفض الطلب في المستوى
 *   الثالث لما عرف مقدّم الطلب من رفضه ولا سببه.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * الأمان: البيانات محروسة في القاعدة بـ can_view_approval_trail (0316) —
 *   مُقدّم الطلب · معتمِد في السلسلة · مدير الوحدة · أدوار المنصة.
 *   من عداهم يحصل على مصفوفة فارغة، والمكوّن لا يعرض شيئاً.
 *   التعليقات محجوبة طبقةً ثانية: تعود NULL لمن لا يخصّه نصّها.
 *
 * ملاحظة عرض: نُظهر «تعليق محجوب» صراحةً بدل الصمت، لأن إخفاء وجود
 *   التعليق يوحي بأن المعتمِد لم يكتب شيئاً — وهذا تضليل.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Loader2,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import {
  unifiedApprovalService,
  type ApprovalSourceModule,
  type ApprovalStep,
} from '../../../services/sdk/UnifiedApprovalService';
import { getErrorMessage } from '../../../services/errors';

/** تسميات الأدوار في سلسلة الاعتماد — تطابق approval_rules.required_role */
const ROLE_LABELS: Record<string, string> = {
  supervisor: 'المشرف',
  manager: 'المدير',
  direct_manager: 'المدير المباشر',
  unit_manager: 'مدير الوحدة',
  finance_manager: 'المدير المالي',
  admin: 'الإدارة',
};

const STATUS_META: Record<
  string,
  { label: string; tone: string; Icon: typeof CheckCircle2 }
> = {
  approved: { label: 'اعتُمد', tone: 'text-emerald-600', Icon: CheckCircle2 },
  rejected: { label: 'رُفض', tone: 'text-rose-600', Icon: XCircle },
  pending: { label: 'بانتظار', tone: 'text-amber-600', Icon: Clock },
  skipped: { label: 'تُخطّي', tone: 'text-slate-400', Icon: Circle },
};

function roleLabel(key: string): string {
  return ROLE_LABELS[key] ?? key;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ar-IQ', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export interface ApprovalTrailProps {
  sourceModule: ApprovalSourceModule;
  sourceId: string;
  /** يبدأ مفتوحاً؟ الافتراضي مطويّ — القائمة قد تحوي عشرات الطلبات */
  defaultOpen?: boolean;
}

export function ApprovalTrail({
  sourceModule,
  sourceId,
  defaultOpen = false,
}: ApprovalTrailProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [steps, setSteps] = useState<ApprovalStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSteps(await unifiedApprovalService.findSteps(sourceModule, sourceId));
      setLoaded(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [sourceModule, sourceId]);

  // تحميل كسول: لا نُطلق طلباً لكل بطاقة في القائمة قبل الفتح
  useEffect(() => {
    if (open && !loaded && !loading) void load();
  }, [open, loaded, loading, load]);

  return (
    <div className="mt-3 border-t border-slate-100 pt-2" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800"
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        مسار الاعتماد
        {loaded && steps.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-black">
            {steps.length}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <Loader2 className="animate-spin" size={14} />
              جارٍ تحميل المسار…
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-2">
              {error}
            </p>
          )}

          {loaded && !loading && steps.length === 0 && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-2.5 leading-relaxed">
              لا مسار متعدد المستويات لهذا الطلب — يُبتّ بمستوى واحد.
              <span className="block text-[11px] text-slate-400 mt-0.5">
                تُضبط المستويات من «الإدارة ← قواعد الاعتماد».
              </span>
            </p>
          )}

          {loaded && steps.length > 0 && (
            <ol className="space-y-1.5">
              {steps.map((s) => {
                const meta = STATUS_META[s.status] ?? STATUS_META.pending;
                const { Icon } = meta;
                return (
                  <li
                    key={`${s.stepOrder}-${s.requiredRole}`}
                    className={`flex items-start gap-2.5 rounded-xl border p-2.5 ${
                      s.isCurrent
                        ? 'border-amber-300 bg-amber-50/60'
                        : s.isMine
                          ? 'border-indigo-200 bg-indigo-50/40'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <Icon size={15} className={`${meta.tone} shrink-0 mt-0.5`} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-black">
                          {s.stepOrder}
                        </span>
                        <span className="text-xs font-black text-slate-800">
                          {s.approverName}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          ({roleLabel(s.requiredRole)})
                        </span>
                        {s.isMine && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-indigo-100 text-indigo-700 font-black">
                            أنت
                          </span>
                        )}
                        {s.isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-amber-100 text-amber-800 font-black">
                            الآن
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[11px] font-bold ${meta.tone}`}>
                          {meta.label}
                        </span>
                        {s.decidedAt && (
                          <span className="text-[11px] text-slate-400">
                            {fmtDate(s.decidedAt)}
                          </span>
                        )}
                        {s.ruleName && (
                          <span className="text-[10px] text-slate-400">
                            · {s.ruleName}
                          </span>
                        )}
                      </div>

                      {s.comments && (
                        <p className="mt-1 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-1.5 flex items-start gap-1.5">
                          <MessageSquare size={11} className="shrink-0 mt-0.5 text-slate-400" />
                          {s.comments}
                        </p>
                      )}

                      {/* حُجب النصّ لا الوجود — الصمت هنا تضليل */}
                      {!s.comments && s.status !== 'pending' && (
                        <p className="mt-1 text-[10px] text-slate-400 italic">
                          تعليق المعتمِد غير متاح لك
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export default ApprovalTrail;
