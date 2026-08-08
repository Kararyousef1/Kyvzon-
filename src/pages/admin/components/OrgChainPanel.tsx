/**
 * OrgChainPanel — الهيكل البشري وسلسلة الاعتماد لقسم
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الفجوة التي يسدّها:
 *   OrgStructurePage كانت تعرض شجرة **أقسام** بلا أشخاص. ترى الأقسام
 *   ولا تعرف من يرأس من، ولا ترى أثر تعديلك على سلاسل الاعتماد.
 *
 *   0304 بنى resolve_org_chain و org_structure_overview لكن بلا واجهة.
 *
 * ما يعرضه:
 *   • سلسلة الاعتماد الفعلية للقسم — ومن أين وُرث كل دور
 *   • عدد موظفي القسم
 *   • تحذير عند غياب معتمِد (سلسلة مكسورة)
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, Crown, Loader2, Shield, UserCog, Users } from 'lucide-react';
import {
  orgStructureService,
  ORG_ROLE_LABELS,
  type OrgChainLink,
  type OrgRole,
} from '../../../services/sdk/OrgStructureService';
import { findUnit } from '../../../shared/constants/portalUnits';

const ROLE_ICONS: Record<OrgRole, typeof Crown> = {
  supervisor: Shield,
  manager: UserCog,
  direct_manager: Crown,
  unit_manager: Users,
};

const ROLE_TONES: Record<OrgRole, string> = {
  supervisor: 'bg-emerald-100 text-emerald-700',
  manager: 'bg-blue-100 text-blue-700',
  direct_manager: 'bg-purple-100 text-purple-700',
  unit_manager: 'bg-amber-100 text-amber-700',
};

export function OrgChainPanel({
  departmentId,
  departmentName,
  unitKey,
  userNameById,
  departmentNameById,
}: {
  departmentId: string;
  departmentName: string;
  /** لعرض سلسلة وحدة بعينها (مدير المشتريات مثلاً) */
  unitKey?: string;
  userNameById: Map<string, string>;
  departmentNameById: Map<string, string>;
}) {
  const [chain, setChain] = useState<OrgChainLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await orgStructureService.resolveChain(departmentId, unitKey);
      setChain(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل السلسلة');
      setChain([]);
    } finally {
      setLoading(false);
    }
  }, [departmentId, unitKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-8" dir="rtl">
        <Loader2 className="animate-spin text-indigo-500" size={22} />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3" dir="rtl">
        {error}
      </p>
    );
  }

  if (chain.length === 0) {
    return (
      <div
        className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2"
        dir="rtl"
      >
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <span>
          <strong>سلسلة اعتماد فارغة.</strong> لم يُسنَد أي دور لقسم «{departmentName}»
          ولا لأي من أقسامه الأعلى — فطلبات موظفيه لن تجد معتمِداً.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2" dir="rtl">
      <p className="text-[11px] text-slate-500">
        ترتيب الاعتماد الفعلي لطلبات موظفي هذا القسم
        {unitKey ? ` في وحدة ${findUnit(unitKey)?.label ?? unitKey}` : ''}:
      </p>

      {chain.map((link, index) => {
        const Icon = ROLE_ICONS[link.orgRole];
        return (
          <div key={`${link.orgRole}-${link.userId}`}>
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ROLE_TONES[link.orgRole]}`}
              >
                <Icon size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate-800 truncate">
                  {userNameById.get(link.userId) ?? '—'}
                </span>
                <span className="block text-[11px] text-slate-500">
                  {ORG_ROLE_LABELS[link.orgRole]}
                  {link.inherited && (
                    <span className="text-amber-600 font-bold">
                      {' '}
                      · موروث من {departmentNameById.get(link.sourceDepartmentId) ?? 'قسم أعلى'}
                    </span>
                  )}
                </span>
              </span>
              <span className="text-[10px] font-black text-slate-400 shrink-0">
                {index + 1}
              </span>
            </div>
            {index < chain.length - 1 && (
              <div className="flex justify-center py-0.5">
                <ArrowDown size={12} className="text-slate-300" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default OrgChainPanel;
