/**
 * ════════════════════════════════════════════════════════════════
 *  OrgStructurePage — الهيكل التنظيمي التفاعلي للشركة
 *
 *  المزايا (وفق المعايير العالمية للهيكل التنظيمي):
 *   - شجرة أقسام هرمية قابلة للتوسّع/الطي (parent/child).
 *   - لوحة تفاصيل عند اختيار قسم: المدير المباشر، المدير، المشرف،
 *     الموظفون، والأقسام الفرعية.
 *   - تعيين الأدوار من قوائم مفلترة بالدور:
 *       مشرف ← مستخدمو supervisor | مدير ← manager | مدير مباشر ← admin
 *   - وراثة تلقائية: المدير/المدير المباشر يُورَثان من القسم الأب إن لم يُعيَّنا
 *     (المشرف خاص بكل قسم). تُعرَض إشارة "موروث".
 *   - إضافة قسم فرعي داخل أي قسم، وحذف قسم.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Building, GitMerge, Loader2, AlertTriangle,
  ChevronDown, ChevronLeft, Users, UserCog, Shield, Crown, CornerDownLeft, X,
} from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import Input from '../../shared/components/ui/Input';
import { departmentService } from '../../services/sdk/DepartmentService';
import { archiveService } from '../../services/sdk/ArchiveService';
import { OrgChainPanel } from './components/OrgChainPanel';
import { userService } from '../../services/sdk/UserService';
import { useUIStore } from '../../core/stores';
import type { DepartmentRecord } from '../../shared/types/sdk';

interface SimpleUser { id: string; full_name?: string; name?: string; role?: string; }
interface DeptEmployee { id: string; first_name?: string; last_name?: string; position?: string; }

type TreeNode = DepartmentRecord & { children: TreeNode[] };

export default function OrgStructurePage() {
  const { addToast } = useUIStore();
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // مستخدمون حسب الدور (لقوائم التعيين)
  // ★ هدف الأرشفة — بديل window.confirm() المحظور (سياسة المنصة)
  const [archiveTarget, setArchiveTarget] = useState<DepartmentRecord | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [supervisors, setSupervisors] = useState<SimpleUser[]>([]);
  const [managers, setManagers] = useState<SimpleUser[]>([]);
  const [admins, setAdmins] = useState<SimpleUser[]>([]);
  const [procurements, setProcurements] = useState<SimpleUser[]>([]);

  // التحديد + التوسّع
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // تفاصيل القسم المحدّد
  const [effectiveRoles, setEffectiveRoles] = useState<Awaited<ReturnType<typeof departmentService.resolveEffectiveRoles>> | null>(null);
  const [deptEmployees, setDeptEmployees] = useState<DeptEmployee[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // نموذج إضافة قسم فرعي / رئيسي
  const [showAdd, setShowAdd] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [saving, setSaving] = useState(false);

  const userName = (u: SimpleUser) => u.full_name || u.name || '—';

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [depts, sup, mgr, adm, proc] = await Promise.all([
        departmentService.findActive(),
        userService.findAllUsers({ role: 'supervisor' }).catch(() => []),
        userService.findAllUsers({ role: 'manager' }).catch(() => []),
        userService.findAllUsers({ role: 'admin' }).catch(() => []),
        userService.findAllUsers({ role: 'procurement' }).catch(() => []),
      ]);
      setDepartments(depts || []);
      setSupervisors((sup as unknown as SimpleUser[]) || []);
      setManagers((mgr as unknown as SimpleUser[]) || []);
      setAdmins((adm as unknown as SimpleUser[]) || []);
      setProcurements((proc as unknown as SimpleUser[]) || []);
    } catch (err) {
      console.error('فشل تحميل الهيكل التنظيمي:', err);
      setError('تعذّر تحميل الهيكل التنظيمي');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // تحميل تفاصيل القسم المحدّد
  const loadDetails = useCallback(async (deptId: string) => {
    setDetailsLoading(true);
    try {
      const [roles, emps] = await Promise.all([
        departmentService.resolveEffectiveRoles(deptId),
        departmentService.findEmployeesByDepartment(deptId),
      ]);
      setEffectiveRoles(roles);
      setDeptEmployees(emps as DeptEmployee[]);
    } catch {
      setEffectiveRoles(null);
      setDeptEmployees([]);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadDetails(selectedId);
  }, [selectedId, loadDetails]);

  // بناء الشجرة
  const tree = useMemo<TreeNode[]>(() => {
    const build = (parentId: string | null): TreeNode[] =>
      departments
        .filter((d) => (d.parent_department_id ?? null) === parentId)
        .map((d) => ({ ...d, children: build(d.id) }));
    return build(null);
  }, [departments]);

  const nameById = useMemo(() => new Map(departments.map((d) => [d.id, d.name_ar])), [departments]);

  // خريطة معرّف المستخدم ← اسمه، لعرض الهيكل البشري في OrgChainPanel
  const userNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of [supervisors, managers, admins, procurements]) {
      for (const u of list) map.set(u.id, u.full_name || u.name || '—');
    }
    return map;
  }, [supervisors, managers, admins, procurements]);
  const selected = departments.find((d) => d.id === selectedId) || null;
  const subDepartments = departments.filter((d) => d.parent_department_id === selectedId);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // إضافة قسم
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameAr.trim()) { addToast('يرجى إدخال اسم القسم', 'error'); return; }
    setSaving(true);
    try {
      await departmentService.create({
        name_ar: nameAr.trim(),
        name_en: nameEn.trim() || undefined,
        parent_department_id: addParentId || undefined,
        is_active: true,
      });
      addToast('تم إضافة القسم', 'success');
      setNameAr(''); setNameEn(''); setShowAdd(false);
      if (addParentId) setExpanded((p) => new Set(p).add(addParentId));
      await loadAll();
    } catch {
      addToast('حدث خطأ أثناء الإضافة', 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * أرشفة القسم — لا حذف نهائي.
   *
   * ★ النسخة السابقة كانت تَعِد بما لا تفعل:
   *      window.confirm('حذف هذا القسم؟ سيتم إزالة ارتباطه بالموظفين
   *                      والأقسام الفرعية.')
   *      → departmentService.delete(id)
   *
   *   مُقاس على Postgres: `departments_parent_department_id_fkey` يمنع
   *   الحذف أصلاً، فتظهر «حدث خطأ أثناء الحذف» بلا سبب. ولو نجح لأباد
   *   `approval_rules` و`org_role_assignments` عبر ON DELETE CASCADE.
   *
   *   `archive_department` (0324) تُعيد سبباً مفهوماً وتحفظ التبعيات.
   */
  const handleArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await archiveService.archiveDepartment(archiveTarget.id);
      addToast('تمت أرشفة القسم — قواعد الاعتماد محفوظة', 'success');
      if (selectedId === archiveTarget.id) setSelectedId(null);
      setArchiveTarget(null);
      await loadAll();
    } catch (err) {
      // ★ السبب الحقيقي لا «حدث خطأ»: عدد الموظفين أو الأقسام الفرعية
      addToast(err instanceof Error ? err.message : 'تعذّرت الأرشفة', 'error');
    } finally {
      setArchiving(false);
    }
  };

  // تعيين دور
  const assignRole = async (
    field: 'supervisor_id' | 'manager_id' | 'direct_manager_id' | 'procurement_manager_id',
    value: string,
  ) => {
    if (!selectedId) return;
    try {
      await departmentService.assignRoles(selectedId, { [field]: value || null } as any);
      addToast('تم تحديث التعيين', 'success');
      // حدّث الحالة المحلية + أعد حساب الوراثة
      setDepartments((prev) => prev.map((d) => (d.id === selectedId ? { ...d, [field]: value || undefined } : d)));
      await loadDetails(selectedId);
    } catch {
      addToast('تعذّر تحديث التعيين', 'error');
    }
  };

  // ─── عقدة الشجرة ─────────────────────────────────────────────
  const TreeNodeItem = ({ node, depth }: { node: TreeNode; depth: number }) => {
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id);
    const isSel = selectedId === node.id;
    return (
      <div>
        <div
          onClick={() => setSelectedId(node.id)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all mb-1 ${
            isSel ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-700'
          }`}
          style={{ marginInlineStart: `${depth * 18}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
              className={`flex-shrink-0 ${isSel ? 'text-white/80' : 'text-slate-400'}`}
            >
              {isOpen ? <ChevronDown size={16} /> : <ChevronLeft size={16} />}
            </button>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}
          <Building size={16} className={`flex-shrink-0 ${isSel ? 'text-white' : 'text-indigo-500'}`} />
          <span className="text-sm font-bold truncate flex-1">{node.name_ar}</span>
          {hasChildren && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${isSel ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>
              {node.children.length}
            </span>
          )}
        </div>
        {hasChildren && isOpen && node.children.map((c) => <TreeNodeItem key={c.id} node={c} depth={depth + 1} />)}
      </div>
    );
  };

  // ─── بطاقة تعيين دور ─────────────────────────────────────────
  const RoleAssignCard = ({
    label, icon, colorCls, options, value, inherited, onChange,
  }: {
    label: string; icon: React.ReactNode; colorCls: string;
    options: SimpleUser[]; value: string | null; inherited?: boolean;
    onChange: (v: string) => void;
  }) => {
    return (
      <div className="rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorCls}`}>{icon}</span>
          <span className="text-sm font-bold text-slate-700">{label}</span>
          {inherited && value && (
            <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full mr-auto">
              موروث من قسم أعلى
            </span>
          )}
        </div>
        <select
          value={inherited ? '' : (value || '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={inherited}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">{inherited ? 'موروث تلقائياً' : '— غير معيّن —'}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{userName(o)}</option>
          ))}
        </select>
        {inherited && value && (
          <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
            <CornerDownLeft size={12} /> المُعيَّن حالياً: {managers.concat(admins).find((u) => u.id === value)?.full_name
              || managers.concat(admins).find((u) => u.id === value)?.name || 'مستخدم'}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-6" dir="rtl">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-3xl border shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
            <GitMerge className="text-indigo-600" /> الهيكل التنظيمي للشركة
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            اضغط على قسم لعرض تفاصيله وتعيين المشرف والمدير والمدير المباشر وإدارة الأقسام الفرعية
          </p>
        </div>
        <Button onClick={() => { setAddParentId(null); setShowAdd(true); }} icon={<Plus size={16} />} iconPosition="left">
          قسم رئيسي جديد
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={32} className="animate-spin text-indigo-600" />
          <p className="text-sm text-slate-500 font-bold">جاري تحميل الهيكل التنظيمي...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 text-red-700">
          <AlertTriangle size={20} /><p className="text-sm font-bold">{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* شجرة الأقسام */}
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-black">
                <Building size={18} className="text-indigo-600" /> الأقسام
              </CardTitle>
            </CardHeader>
            <div className="p-3 max-h-[70vh] overflow-y-auto">
              {tree.length === 0 ? (
                <div className="text-center py-10">
                  <Building size={36} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500 font-bold">لا توجد أقسام بعد</p>
                  <Button variant="outline" className="mt-3" onClick={() => { setAddParentId(null); setShowAdd(true); }} icon={<Plus size={14} />} iconPosition="left">
                    إضافة أول قسم
                  </Button>
                </div>
              ) : (
                tree.map((node) => <TreeNodeItem key={node.id} node={node} depth={0} />)
              )}
            </div>
          </Card>

          {/* لوحة التفاصيل */}
          <div className="lg:col-span-2">
            {!selected ? (
              <Card>
                <div className="text-center py-20">
                  <UserCog size={44} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-sm text-slate-500 font-bold">اختر قسماً من القائمة لعرض تفاصيله</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-6">
                {/* رأس القسم */}
                <Card>
                  <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-black text-slate-800">{selected.name_ar}</h2>
                      {selected.name_en && <p className="text-xs text-slate-400 font-mono">{selected.name_en}</p>}
                      {selected.parent_department_id && (
                        <p className="text-xs text-slate-500 mt-1">
                          قسم فرعي ضمن: <span className="font-bold">{nameById.get(selected.parent_department_id)}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setAddParentId(selected.id); setShowAdd(true); }} icon={<Plus size={14} />} iconPosition="left">
                        قسم فرعي
                      </Button>
                      <Button variant="danger" onClick={() => setArchiveTarget(selected)} icon={<Trash2 size={14} />} iconPosition="left">
                        أرشفة
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* تعيين الأدوار */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-black">القيادة والإشراف — مع مسؤول المشتريات</CardTitle>
                  </CardHeader>
                  <div className="p-5 pt-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {detailsLoading || !effectiveRoles ? (
                      <div className="col-span-4 flex justify-center py-8"><Loader2 className="animate-spin text-indigo-500" /></div>
                    ) : (
                      <>
                        <RoleAssignCard
                          label="المدير المباشر" icon={<Crown size={16} />} colorCls="bg-purple-100 text-purple-600"
                          options={admins} value={effectiveRoles.direct_manager_id}
                          inherited={effectiveRoles.direct_manager_inherited}
                          onChange={(v) => assignRole('direct_manager_id', v)}
                        />
                        <RoleAssignCard
                          label="المدير" icon={<UserCog size={16} />} colorCls="bg-blue-100 text-blue-600"
                          options={managers} value={effectiveRoles.manager_id}
                          inherited={effectiveRoles.manager_inherited}
                          onChange={(v) => assignRole('manager_id', v)}
                        />
                        <RoleAssignCard
                          label="المشرف" icon={<Shield size={16} />} colorCls="bg-emerald-100 text-emerald-600"
                          options={supervisors} value={(effectiveRoles as any).supervisor_id}
                          onChange={(v) => assignRole('supervisor_id', v)}
                        />
                        <RoleAssignCard
                          label="مسؤول المشتريات" icon={<Building size={16} />} colorCls="bg-amber-100 text-amber-600"
                          options={procurements} value={(effectiveRoles as any).procurement_manager_id}
                          inherited={(effectiveRoles as any).procurement_manager_inherited}
                          onChange={(v) => assignRole('procurement_manager_id', v)}
                        />
                      </>
                    )}
                  </div>
                  <div className="px-5 pb-4">
                    <p className="text-[11px] text-slate-400">يُستخدم مسؤول المشتريات في سير موافقات طلبات الشراء PR — يُورث من القسم الأب إذا لم يُعيَّن، ويُطبق قواعد المبلغ (5K→مدير، 50K→مالية، 500K→إدارة).</p>
                  </div>
                </Card>

                {/* الهيكل البشري وسلسلة الاعتماد (0304/0306).
                    الشجرة أعلاه تعرض الأقسام؛ هذه تعرض **الأشخاص** وترتيب
                    اعتمادهم — بما فيه ما وُرث من الأقسام الأعلى. */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-black flex items-center gap-2">
                      <GitMerge size={16} className="text-indigo-600" /> سلسلة الاعتماد الفعلية
                    </CardTitle>
                  </CardHeader>
                  <div className="p-5 pt-0">
                    <OrgChainPanel
                      departmentId={selected.id}
                      departmentName={selected.name_ar}
                      userNameById={userNameById}
                      departmentNameById={nameById}
                    />
                  </div>
                </Card>

                {/* الأقسام الفرعية */}
                {subDepartments.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base font-black flex items-center gap-2">
                        <GitMerge size={16} className="text-indigo-600" /> الأقسام الفرعية ({subDepartments.length})
                      </CardTitle>
                    </CardHeader>
                    <div className="p-5 pt-0 grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {subDepartments.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedId(s.id)}
                          className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-right"
                        >
                          <Building size={15} className="text-indigo-500 flex-shrink-0" />
                          <span className="text-sm font-bold text-slate-700 truncate">{s.name_ar}</span>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                {/* الموظفون */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-black flex items-center gap-2">
                      <Users size={16} className="text-indigo-600" /> موظفو القسم ({deptEmployees.length})
                    </CardTitle>
                  </CardHeader>
                  <div className="p-5 pt-0">
                    {detailsLoading ? (
                      <div className="flex justify-center py-6"><Loader2 className="animate-spin text-indigo-500" /></div>
                    ) : deptEmployees.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-6">لا يوجد موظفون في هذا القسم</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {deptEmployees.map((e) => (
                          <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
                              {(e.first_name || '؟').charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-700 truncate">{[e.first_name, e.last_name].filter(Boolean).join(' ') || '—'}</p>
                              {e.position && <p className="text-xs text-slate-400 truncate">{e.position}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: إضافة قسم */}
      {showAdd && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-800">
                {addParentId ? `قسم فرعي داخل: ${nameById.get(addParentId)}` : 'قسم رئيسي جديد'}
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">اسم القسم (بالعربية) *</label>
                <Input placeholder="مثال: قسم الحسابات" value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">اسم القسم (إنجليزي - اختياري)</label>
                <Input placeholder="Accounting" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
              </div>
              <Button type="submit" loading={saving} fullWidth icon={<Plus size={16} />} iconPosition="left">
                إضافة القسم
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ★ تأكيد الأرشفة — Modal لا window.confirm() (سياسة المنصة) */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">تأكيد أرشفة القسم</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              أرشفة قسم <b>«{archiveTarget.name_ar}»</b>؟
            </p>
            <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3 leading-relaxed">
              القسم يُؤرشَف ولا يُحذف: قواعد الاعتماد والإسنادات التنظيمية
              المرتبطة به تبقى سليمة. إن كان فيه موظفون أو أقسام فرعية نشطة
              فستظهر رسالة تشرح المانع بالضبط.
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiving}>
                تراجع
              </Button>
              <Button variant="danger" onClick={() => void handleArchive()} loading={archiving}>
                أرشفة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
