/**
 * MrpRolesAdminPage — إسناد أدوار التصنيع الدقيقة
 *
 * ═════════════════════════════════════════════════════════════════════════
 * الفجوة التي تسدّها:
 *
 *   جدول mrp_user_roles أُنشئ في 0218 بتسعة أدوار دقيقة، وبقي **يتيماً**:
 *   صفر دالة تقرأه. وكان mrp_require_roles يفحص profiles.role وحده،
 *   فالأدوار التسعة كانت أسماءً في 388 استدعاءً لا تُنفَّذ أبداً —
 *   production_manager وحده في 99 موضعاً.
 *
 *   الأثر: كل صلاحيات التصنيع تنهار إلى دور خشن واحد 'manufacturing'.
 *   مخطِّط الإنتاج ومهندس قوائم المواد ومفتّش الجودة — كلهم إما
 *   'manufacturing' بكل الصلاحيات أو لا شيء. عكس مبدأ أقل امتياز.
 *
 *   0312 أحيا الجدول · 0314 أكمل الدورة · هذه الصفحة تُتيحها للإدارة.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * قرارات تصميمية:
 *
 *   • الكتالوج يُقرأ من القاعدة (mrp_role_catalog) لا من ثابت TS —
 *     مُشتقّ من قيد CHECK فيستحيل انحراف مصدرَي حقيقة.
 *
 *   • لا confirm() — تأكيد السحب داخل Modal (سياسة المشروع).
 *
 *   • السحب تعطيل لا حذف؛ الصفوف المؤرشفة تُعرض بوسم واضح لأن
 *     «من كان يملك هذا الدور» سؤال تدقيقي مشروع.
 *
 *   • الصفحة لا تلمس Supabase — كل شيء عبر mrpRoleService.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Factory,
  Info,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import {
  mrpRoleService,
  type MrpPlantOption,
  type MrpRoleAssignment,
  type MrpRoleCatalogEntry,
} from '../../services/sdk/MrpRoleService';
import { userService } from '../../services/sdk/UserService';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Modal from '../../shared/components/ui/Modal';
import { getErrorMessage } from '../../services/errors';

interface UserOption {
  id: string;
  full_name?: string | null;
  role?: string | null;
}

interface RevokeTarget {
  userId: string;
  fullName: string;
  roleKey: string;
  roleLabel: string;
  plantId: string | null;
  plantName: string | null;
}

export default function MrpRolesAdminPage() {
  const { addToast } = useUIStore();

  const [catalog, setCatalog] = useState<MrpRoleCatalogEntry[]>([]);
  const [rows, setRows] = useState<MrpRoleAssignment[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [plants, setPlants] = useState<MrpPlantOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState('');
  const [formRole, setFormRole] = useState('');
  /** '' = كل المصانع (plant_id = NULL) */
  const [formPlant, setFormPlant] = useState('');

  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, allowed] = await Promise.all([
        mrpRoleService.findCatalog(),
        mrpRoleService.canManage(),
      ]);
      setCatalog(cat);
      setCanManage(allowed);

      // غير المخوَّل: القاعدة تعيد صفراً من الصفوف — لا نُطلق طلبات بلا فائدة
      if (allowed) {
        const [overview, userList, plantList] = await Promise.all([
          mrpRoleService.findOverview(),
          userService.findAllUsers().catch(() => []),
          // المصانع اختيارية: شركة بلا مصانع مسجَّلة تعمل بنطاق «كل المصانع»
          mrpRoleService.findPlants().catch(() => []),
        ]);
        setRows(overview);
        setUsers(userList as UserOption[]);
        setPlants(plantList);
      } else {
        setRows([]);
        setUsers([]);
        setPlants([]);
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleLabel = useCallback(
    (key: string) => catalog.find((c) => c.roleKey === key)?.labelAr ?? key,
    [catalog],
  );

  const visibleRows = useMemo(
    () => (showArchived ? rows : rows.filter((r) => r.isActive)),
    [rows, showArchived],
  );

  /** الدور المختار في النموذج — لعرض إرشاد التنطيق */
  const selectedRoleEntry = useMemo(
    () => catalog.find((c) => c.roleKey === formRole),
    [catalog, formRole],
  );

  /** تجميع حسب المستخدم — الشاشة تجيب «من يملك ماذا» لا «أي صف موجود» */
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; baseRole: string; items: MrpRoleAssignment[] }>();
    for (const r of visibleRows) {
      const entry = map.get(r.userId) ?? { name: r.fullName, baseRole: r.baseRole, items: [] };
      entry.items.push(r);
      map.set(r.userId, entry);
    }
    return [...map.entries()].map(([userId, v]) => ({ userId, ...v }));
  }, [visibleRows]);

  const archivedCount = useMemo(() => rows.filter((r) => !r.isActive).length, [rows]);

  const handleAssign = async () => {
    if (!formUser || !formRole) {
      addToast('اختر المستخدم والدور.', 'error');
      return;
    }
    setSaving(true);
    try {
      const plantId = formPlant || null;
      await mrpRoleService.assign(formUser, formRole, plantId);
      const scope = plantId
        ? plants.find((p) => p.plantId === plantId)?.nameAr ?? 'مصنع محدَّد'
        : 'كل المصانع';
      addToast(`أُسنِد دور «${roleLabel(formRole)}» — ${scope}.`, 'success');
      setFormOpen(false);
      setFormUser('');
      setFormRole('');
      setFormPlant('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setSaving(true);
    try {
      const n = await mrpRoleService.revoke(
        revokeTarget.userId,
        revokeTarget.roleKey,
        revokeTarget.plantId,
      );
      addToast(
        n > 0
          ? `سُحِب دور «${revokeTarget.roleLabel}».`
          : 'الدور لم يكن نشطاً — لا تغيير.',
        n > 0 ? 'success' : 'info',
      );
      setRevokeTarget(null);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── غير مخوَّل ───────────────────────────────────────────────────────
  if (!loading && !canManage) {
    return (
      <div className="p-6" dir="rtl">
        <Card>
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <ShieldCheck size={30} />
            </div>
            <h1 className="text-xl font-black text-slate-900 mb-2">
              إدارة أدوار التصنيع غير متاحة لحسابك
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed max-w-md mx-auto">
              تحتاج صلاحية إدارية، أو إسناد وحدة «التصنيع» لحسابك كمدير من
              «إدارة المستخدمين ← الخطوة الثالثة ← وحدات البوابة».
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      {/* ترويسة */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Factory className="text-orange-600" size={26} />
            أدوار التصنيع الدقيقة
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            تُكمّل دور «تصنيع» الخشن بصلاحيات مُحدَّدة لكل وظيفة — مبدأ أقل امتياز.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void load()} icon={<RefreshCw size={14} />}>
            تحديث
          </Button>
          <Button
            onClick={() => {
              // تصفير النموذج عند كل فتح — لا تتسرّب قيم الإسناد السابق
              setFormUser('');
              setFormRole('');
              setFormPlant('');
              setFormOpen(true);
            }}
            icon={<Plus size={14} />}
          >
            إسناد دور
          </Button>
        </div>
      </div>

      {/* شرح المعمارية */}
      <Card>
        <div className="p-4 bg-orange-50/50 border-r-4 border-orange-400 rounded-xl flex gap-3">
          <Info className="text-orange-600 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-slate-700 leading-relaxed space-y-1">
            <p className="font-bold text-slate-900">
              لماذا دوران؟ الدور الخشن في الملف الشخصي · والدقيق هنا.
            </p>
            <p>
              <b>profiles.role</b> يحمل دوراً واحداً فقط لكل مستخدم، فلا يتّسع
              لتسع وظائف تصنيعية. هذه الأدوار تُخزَّن منفصلةً فيمكن للمستخدم
              الواحد حمل أكثر من دور — مثلاً «مهندس قوائم المواد» و«مفتّش الجودة» معاً.
            </p>
            <p>
              من يحمل الدور الخشن <b>تصنيع</b> يمرّ على كل العمليات، أما من يحمل
              دوراً دقيقاً فيمرّ على ما يخصّه وحده.
            </p>
          </div>
        </div>
      </Card>

      {/* الأدوار المتاحة */}
      <Card>
        <div className="p-4">
          <h2 className="text-sm font-black text-slate-800 mb-3">
            الأدوار المتاحة ({catalog.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {catalog.map((c) => {
              const count = rows.filter((r) => r.mrpRole === c.roleKey && r.isActive).length;
              return (
                <span
                  key={c.roleKey}
                  title={
                    c.plantScoped
                      ? 'دور ميداني — يُنصح بتنطيقه بمصنع'
                      : 'دور على مستوى الشركة'
                  }
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                >
                  {c.plantScoped && <Factory size={11} className="text-orange-500" />}
                  <span className="font-bold text-slate-700">{c.labelAr}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-lg font-black ${
                      count > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </Card>

      {/* الإسنادات */}
      <Card>
        <div className="p-4">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Users size={16} className="text-slate-400" />
              الإسنادات ({grouped.length} مستخدماً)
            </h2>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                {showArchived
                  ? 'إخفاء المسحوبة'
                  : `عرض المسحوبة (${archivedCount})`}
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-slate-400 text-center py-8">جارٍ التحميل…</p>
          ) : grouped.length === 0 ? (
            <div className="text-center py-10">
              <AlertTriangle className="mx-auto text-slate-300 mb-3" size={32} />
              <p className="text-sm font-bold text-slate-600">لا إسنادات بعد</p>
              <p className="text-xs text-slate-400 mt-1">
                كل عمليات التصنيع تعتمد حالياً على الدور الخشن «تصنيع» وحده.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map((g) => (
                <div
                  key={g.userId}
                  className="border border-slate-200 rounded-xl p-3 bg-white"
                >
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-800">{g.name}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 font-bold">
                        {g.baseRole}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {g.items.filter((i) => i.isActive).length} دور نشط
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.items.map((it) => (
                      <span
                        key={`${it.userId}-${it.mrpRole}-${it.plantId ?? 'all'}`}
                        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs ${
                          it.isActive
                            ? 'bg-orange-50 border-orange-200 text-orange-800'
                            : 'bg-slate-50 border-slate-200 text-slate-400 line-through'
                        }`}
                      >
                        <span className="font-bold">{roleLabel(it.mrpRole)}</span>
                        {it.plantName && (
                          <span className="text-[10px] opacity-75">· {it.plantName}</span>
                        )}
                        {!it.plantId && (
                          <span className="text-[10px] opacity-60">· كل المصانع</span>
                        )}
                        {it.isActive && (
                          <button
                            type="button"
                            title="سحب الدور"
                            onClick={() =>
                              setRevokeTarget({
                                userId: it.userId,
                                fullName: it.fullName,
                                roleKey: it.mrpRole,
                                roleLabel: roleLabel(it.mrpRole),
                                plantId: it.plantId,
                                plantName: it.plantName,
                              })
                            }
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* نافذة الإسناد */}
      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title="إسناد دور تصنيع">
        <div className="space-y-4" dir="rtl">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">المستخدم</label>
            <select
              value={formUser}
              onChange={(e) => setFormUser(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500"
            >
              <option value="">— اختر المستخدم —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name ?? u.id} ({u.role ?? '—'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">الدور</label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500"
            >
              <option value="">— اختر الدور —</option>
              {catalog.map((c) => (
                <option key={c.roleKey} value={c.roleKey}>
                  {c.labelAr}
                </option>
              ))}
            </select>
          </div>

          {/* اختيار النطاق (0315) */}
          <div>
            <label className="text-xs font-bold text-slate-600 mb-1.5 block">
              النطاق
              {selectedRoleEntry?.plantScoped && (
                <span className="text-orange-600 font-normal mr-1">
                  — يُنصح بتحديد مصنع لهذا الدور
                </span>
              )}
            </label>
            {plants.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                لا مصانع مسجَّلة — سيُسنَد الدور على <b>كل المصانع</b>.
                تُضاف المصانع من بوابة التصنيع.
              </p>
            ) : (
              <select
                value={formPlant}
                onChange={(e) => setFormPlant(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500"
              >
                <option value="">كل المصانع (نطاق الشركة)</option>
                {plants.map((p) => (
                  <option key={p.plantId} value={p.plantId}>
                    {p.nameAr} ({p.plantCode})
                  </option>
                ))}
              </select>
            )}
          </div>

          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 leading-relaxed">
            الإسناد لا يُغيّر دور المستخدم الأساسي، ويمكن للمستخدم حمل أكثر من
            دور تصنيعي. <b>نفس الدور في مصنعين إسنادان مستقلان</b> — سحب أحدهما
            لا يمسّ الآخر.
          </p>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setFormOpen(false)} icon={<X size={14} />}>
              إلغاء
            </Button>
            <Button onClick={() => void handleAssign()} loading={saving} icon={<Plus size={14} />}>
              إسناد
            </Button>
          </div>
        </div>
      </Modal>

      {/* تأكيد السحب — Modal لا confirm() */}
      <Modal
        isOpen={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="تأكيد سحب الدور"
      >
        <div className="space-y-4" dir="rtl">
          <p className="text-sm text-slate-700 leading-relaxed">
            سحب دور <b>«{revokeTarget?.roleLabel}»</b> من{' '}
            <b>{revokeTarget?.fullName}</b>
            {revokeTarget?.plantName ? ` في ${revokeTarget.plantName}` : ''}؟
          </p>
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
            السجل يُؤرشَف ولا يُحذف — يبقى ظاهراً تحت «عرض المسحوبة» للتدقيق،
            ويمكن إعادة إسناده لاحقاً دون إنشاء سجل جديد.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setRevokeTarget(null)}>
              تراجع
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleRevoke()}
              loading={saving}
              icon={<Trash2 size={14} />}
            >
              سحب الدور
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
