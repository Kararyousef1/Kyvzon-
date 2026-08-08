import { useCallback, useEffect, useState } from 'react';
import { Award, Link2, Link2Off, Plus, Smartphone, Users , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsDriverService } from '../../../../services/sdk/LogisticsFleetService';
import type { LogisticsDriverRecord } from '../../../../shared/types/logistics-fleet';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import { logisticsFleetOperationsService } from '../../../../services/sdk/LogisticsFleetOperationsService';
import { driverAppService } from '../../../../services/sdk/DriverAppService';
import { userService, type UserProfile } from '../../../../services/sdk/UserService';

export default function LogisticsDriversPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    driverNameAr: '', licenseNumber: '', licenseClass: 'heavy',
    licenseExpiryDate: '', phone: '',
  });
  const [drivers, setDrivers] = useState<LogisticsDriverRecord[]>([]);
  /* ربط حساب السائق (0291) — بدونه تطبيق السائق غير قابل للوصول */
  const [linkTarget, setLinkTarget] = useState<LogisticsDriverRecord | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsDriverService.findAll({ orderBy: 'driver_name_ar', ascending: true });
      setDrivers(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const openLink = async (d: LogisticsDriverRecord) => {
    setLinkTarget(d);
    setSelectedUser(d.user_id ?? '');
    setUsersLoading(true);
    try {
      setUsers(await userService.findAllUsers());
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setUsersLoading(false);
    }
  };

  /* الربط يفتح تطبيق السائق لهذا الحساب. NULL يفك الربط ويقطع وصوله. */
  const submitLink = async (unlink = false) => {
    if (!linkTarget) return;
    setSaving(true);
    try {
      await driverAppService.linkDriverAccount(
        linkTarget.id, unlink ? null : (selectedUser || null));
      addToast(unlink ? 'فُكّ ربط الحساب' : 'رُبط الحساب بالسائق', 'success');
      setLinkTarget(null);
      setSelectedUser('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  /* الإنشاء عبر RPC create_fleet_driver (0283): يرفض الرخصة المنتهية والرقم المكرَّر */
  const submitDriver = async () => {
    setSaving(true);
    try {
      await logisticsFleetOperationsService.createDriver(form);
      addToast('تمت إضافة السائق', 'success');
      setShowCreate(false);
      setForm({ driverNameAr: '', licenseNumber: '', licenseClass: 'heavy', licenseExpiryDate: '', phone: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_drivers" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L02</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Users /> السائقون والامتثال المروري</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة رخص القيادة، درجات السلامة، وحالة التواجد للسائقين.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">سائق جديد</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['اسم السائق', 'رقم الرخصة', 'فئة الرخصة', 'انتهاء الرخصة', 'درجة السلامة', 'الحالة', 'تطبيق السائق'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {drivers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد بيانات للسائقين مسجلة.</td></tr>
              ) : drivers.map(d => (
                <tr key={d.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-800">{d.driver_name_ar}</td>
                  <td className="py-3 px-4 font-mono text-indigo-600">{d.license_number}</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{d.license_class}</span></td>
                  <td className="py-3 px-4 font-mono text-slate-600">{d.license_expiry_date}</td>
                  <td className="py-3 px-4 font-bold text-emerald-700 flex items-center gap-1"><Award size={14} /> {d.safety_score}%</td>
                  <td className="py-3 px-4">
                    {d.status === 'active' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> :
                     d.status === 'on_trip' ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">في رحلة</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{d.status}</span>}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => void openLink(d)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 ${
                        d.user_id
                          ? 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                          : 'text-slate-500 hover:bg-slate-50'}`}
                    >
                      {d.user_id ? <><Smartphone size={13} /> مُفعَّل</> : <><Link2 size={13} /> ربط حساب</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {linkTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg" dir="rtl">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-lg">ربط حساب تطبيق السائق</h3>
              <button type="button" onClick={() => setLinkTarget(null)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">{linkTarget.driver_name_ar}</p>

            <label className="text-xs font-bold text-slate-600">حساب المستخدم</label>
            {usersLoading ? (
              <p className="text-sm text-slate-400 py-4 text-center">جارٍ تحميل الحسابات…</p>
            ) : (
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full border rounded-xl p-2.5 text-sm mt-1"
              >
                <option value="">— بلا حساب —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role})
                  </option>
                ))}
              </select>
            )}

            <div className="mt-3 text-[11px] text-slate-500 bg-slate-50 border rounded-xl p-3 space-y-1">
              <p>الربط يمنح هذا الحساب تطبيق السائق: يرى <strong>رحلاته وحده</strong>،
                 ويشارك موقعه، ويسجّل إثبات التسليم.</p>
              <p>لا يمنحه أي صلاحية على الأسطول ولا التكاليف ولا رحلات الزملاء.</p>
              <p>حساب واحد لا يُربط بسائقَين، ولا يُربط حساب من مستأجر آخر.</p>
            </div>

            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitLink(false)} loading={saving}
                className="flex-1" disabled={usersLoading}>حفظ الربط</Button>
              {linkTarget.user_id && (
                <Button variant="secondary" onClick={() => void submitLink(true)}
                  loading={saving} className="flex-1 !text-rose-700"
                  icon={<Link2Off size={15} />} iconPosition="left">فك الربط</Button>
              )}
              <Button variant="secondary" onClick={() => setLinkTarget(null)}
                className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">سائق جديد</h3>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">اسم السائق *</label>
                <Input value={form.driverNameAr}
                  onChange={(e) => setForm({ ...form, driverNameAr: e.target.value })} />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">رقم الرخصة *</label>
                  <Input value={form.licenseNumber}
                    onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">فئة الرخصة *</label>
                  <select value={form.licenseClass} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                    onChange={(e) => setForm({ ...form, licenseClass: e.target.value })}>
                    {['A','B','C','D','E','heavy','hazmat'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">انتهاء الرخصة *</label>
                  <Input type="date" value={form.licenseExpiryDate}
                    onChange={(e) => setForm({ ...form, licenseExpiryDate: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">الهاتف</label>
                  <Input value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                لا يُقبل تسجيل سائق برخصة منتهية، ولا تكرار رقم الرخصة.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitDriver()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
