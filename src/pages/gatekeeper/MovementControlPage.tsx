import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Clock, Loader2, Plus, Search, ShieldAlert } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeService, movementLogService, movementPermitService } from '../../services/sdk';
import type { MovementLogRecord, MovementPermitRecord } from '../../shared/types/sdk';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { getErrorMessage } from '../../services/errors';
import { differenceInMinutes, format, subDays } from 'date-fns';
import { ar } from 'date-fns/locale';

const destinations = ['الكافتيريا', 'العيادة', 'الموارد البشرية', 'البوابة الخارجية', 'المستودع', 'الصيانة', 'أخرى'];

export default function MovementControlPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState<MovementLogRecord[]>([]);
  const [permits, setPermits] = useState<MovementPermitRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeView, setMovementView] = useState<'movements' | 'permits'>('movements');
  const [showCreate, setShowCreate] = useState(false);
  const [showPermit, setShowPermit] = useState(false);
  const [returning, setReturning] = useState<MovementLogRecord | null>(null);
  const [actualLocation, setActualLocation] = useState('عاد لمكان الخروج');
  const [form, setForm] = useState({ employee_id: '', destination: 'الكافتيريا', customDestination: '', purpose: '', expected_minutes: 30, notes: '' });
  const [permitForm, setPermitForm] = useState({ employee_id: '', destination: 'الكافتيريا', customDestination: '', purpose: '', valid_minutes: 120, max_duration_minutes: 30, notes: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fromDate = subDays(new Date(), 7).toISOString();
      const [movementRows, employeeRows, permitRows] = await Promise.all([
        movementLogService.findMovements({ fromDate }),
        employeeService.findAll({ filters: { is_active: true }, orderBy: 'full_name_ar' }),
        movementPermitService.findActivePermits(),
      ]);
      setMovements(movementRows || []);
      setEmployees(employeeRows || []);
      setPermits(permitRows || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const employeeMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  const enriched = useMemo(() => movements.map(m => {
    const emp = employeeMap.get(m.employee_id);
    const minutesOut = m.returned_at
      ? differenceInMinutes(new Date(m.returned_at), new Date(m.departure_at))
      : differenceInMinutes(new Date(), new Date(m.departure_at));
    const expected = m.expected_return_at ? differenceInMinutes(new Date(m.expected_return_at), new Date(m.departure_at)) : 60;
    const overdue = !m.returned_at && minutesOut > expected;
    return { ...m, emp, minutesOut, expected, overdue };
  }), [employeeMap, movements]);

  const summary = useMemo(() => ({
    total: movements.length,
    active: enriched.filter(m => !m.returned_at).length,
    overdue: enriched.filter(m => m.overdue).length,
    violations: enriched.filter(m => m.route_violation || m.notes?.includes('مخالفة مسار')).length,
    permits: permits.length,
  }), [enriched, movements.length, permits.length]);

  const filtered = enriched.filter(m => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [m.emp?.full_name_ar, m.employee_name, m.department, m.destination, m.purpose, m.notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const createMovement = async () => {
    if (!form.employee_id) return addToast('يرجى اختيار الموظف', 'warning');
    const emp = employeeMap.get(form.employee_id);
    const destination = form.destination === 'أخرى' ? form.customDestination.trim() : form.destination;
    if (!destination) return addToast('يرجى تحديد الوجهة', 'warning');
    const departure = new Date();
    const matchedPermit = permits.find(p => p.employee_id === form.employee_id && p.destination === destination && new Date(p.valid_from) <= departure && new Date(p.valid_until) >= departure);
    const expectedMinutes = matchedPermit?.max_duration_minutes || Number(form.expected_minutes || 30);
    const expected = new Date(departure.getTime() + expectedMinutes * 60000);
    try {
      const movement = await movementLogService.recordMovement({
        employee_id: form.employee_id,
        employee_name: emp?.full_name_ar || emp?.full_name || emp?.email,
        department: emp?.departments?.name || emp?.department || '',
        destination,
        purpose: form.purpose.trim() || matchedPermit?.purpose || undefined,
        notes: `${matchedPermit ? `[تصريح حركة: ${matchedPermit.id}] ` : '[بدون تصريح حركة] '}${form.notes.trim() || matchedPermit?.notes || ''}`,
        logged_by_id: user?.id,
        departure_at: departure.toISOString(),
        expected_return_at: expected.toISOString(),
      } as MovementLogRecord);
      if (matchedPermit) await movementPermitService.markUsed(matchedPermit.id, movement.id);
      addToast(matchedPermit ? 'تم تسجيل الحركة باستخدام تصريح مسبق' : 'تم تسجيل حركة الموظف بدون تصريح مسبق', matchedPermit ? 'success' : 'warning');
      setShowCreate(false);
      setForm({ employee_id: '', destination: 'الكافتيريا', customDestination: '', purpose: '', expected_minutes: 30, notes: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const createPermit = async () => {
    if (!permitForm.employee_id) return addToast('يرجى اختيار الموظف للتصريح', 'warning');
    const emp = employeeMap.get(permitForm.employee_id);
    const destination = permitForm.destination === 'أخرى' ? permitForm.customDestination.trim() : permitForm.destination;
    if (!destination) return addToast('يرجى تحديد وجهة التصريح', 'warning');
    const now = new Date();
    const validUntil = new Date(now.getTime() + Number(permitForm.valid_minutes || 120) * 60000);
    try {
      await movementPermitService.createPermit({
        employee_id: permitForm.employee_id,
        employee_name: emp?.full_name_ar || emp?.full_name || emp?.email,
        department: emp?.departments?.name || emp?.department || '',
        destination,
        purpose: permitForm.purpose.trim() || undefined,
        valid_from: now.toISOString(),
        valid_until: validUntil.toISOString(),
        max_duration_minutes: Number(permitForm.max_duration_minutes || 30),
        created_by: user?.id,
        approved_by: user?.id,
        notes: permitForm.notes.trim() || undefined,
      });
      addToast('تم إنشاء تصريح الحركة', 'success');
      setShowPermit(false);
      setPermitForm({ employee_id: '', destination: 'الكافتيريا', customDestination: '', purpose: '', valid_minutes: 120, max_duration_minutes: 30, notes: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const confirmReturn = async () => {
    if (!returning) return;
    const expectedDestination = returning.destination || 'غير محدد';
    const violation = actualLocation !== 'عاد لمكان الخروج' && actualLocation !== expectedDestination;
    const notes = violation
      ? `${returning.notes || ''} | [مخالفة مسار 🚨] صرّح بـ(${expectedDestination}) ووصل إلى (${actualLocation})`
      : `${returning.notes || ''} | [تأكيد عودة] ${actualLocation}`;
    try {
      await movementLogService.recordReturn(returning.id, notes, actualLocation);
      addToast(violation ? 'تم تسجيل العودة مع مخالفة مسار' : 'تم تسجيل عودة الموظف', violation ? 'warning' : 'success');
      setReturning(null);
      setActualLocation('عاد لمكان الخروج');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={36} /></div>;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/70 text-sm font-semibold">Movement Control</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><ArrowRightLeft /> بوابة الحركة</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة خروج وعودة الموظفين، التصاريح، التأخير، ومخالفات المسار.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowPermit(true)} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">تصريح حركة</Button>
          <Button onClick={() => setShowCreate(true)} className="!bg-white/15 hover:!bg-white/25 !text-white !border-none" icon={<Plus size={16} />} iconPosition="left">تسجيل حركة</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الحركات', value: summary.total, icon: ArrowRightLeft, color: 'bg-indigo-50 text-indigo-700' },
          { label: 'في الخارج الآن', value: summary.active, icon: Clock, color: 'bg-amber-50 text-amber-700' },
          { label: 'متأخرون', value: summary.overdue, icon: AlertTriangle, color: 'bg-red-50 text-red-700' },
          { label: 'مخالفات مسار', value: summary.violations, icon: ShieldAlert, color: 'bg-rose-50 text-rose-700' },
          { label: 'تصاريح متاحة', value: summary.permits, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
        ].map(item => { const Icon = item.icon; return <Card key={item.label}><div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${item.color}`}><Icon size={18} /></div><p className="text-2xl font-extrabold text-slate-900">{item.value}</p><p className="text-xs text-slate-500">{item.label}</p></Card>; })}
      </div>

      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5">
        <button onClick={() => setMovementView('movements')} className={`flex-1 py-2 rounded-xl text-sm font-bold ${activeView === 'movements' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>الحركات</button>
        <button onClick={() => setMovementView('permits')} className={`flex-1 py-2 rounded-xl text-sm font-bold ${activeView === 'permits' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>التصاريح</button>
      </div>

      <div className="relative"><Search size={16} className="absolute right-3 top-3 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الموظف أو الوجهة..." className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-indigo-400" /></div>

      {activeView === 'movements' ? <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead><tr className="bg-slate-50 border-b border-slate-100">{['الموظف','القسم','الوجهة','الخروج','العودة','المدة','الحالة','إجراء'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={8} className="text-center py-12 text-slate-400">لا توجد حركات مطابقة</td></tr> : filtered.map(m => (
                <tr key={m.id} className={`border-b border-slate-50 hover:bg-slate-50 ${m.overdue ? 'bg-red-50/50' : ''}`}>
                  <td className="py-3 px-4 font-bold text-slate-800">{m.emp?.full_name_ar || m.employee_name || 'موظف'}</td>
                  <td className="py-3 px-4 text-slate-600">{m.department || m.emp?.department || '—'}</td>
                  <td className="py-3 px-4"><span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{m.destination || '—'}</span></td>
                  <td className="py-3 px-4 text-slate-500 font-mono">{format(new Date(m.departure_at), 'dd MMM HH:mm', { locale: ar })}</td>
                  <td className="py-3 px-4 text-slate-500 font-mono">{m.returned_at ? format(new Date(m.returned_at), 'dd MMM HH:mm', { locale: ar }) : 'في الخارج'}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{m.minutesOut} دقيقة</td>
                  <td className="py-3 px-4">
                    {m.route_violation || m.notes?.includes('مخالفة مسار') ? <span className="text-xs font-bold px-2 py-1 rounded-full bg-red-50 text-red-700">مخالفة</span> : m.overdue ? <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700">متأخر</span> : m.returned_at ? <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">عاد</span> : <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-700">خارج</span>}
                  </td>
                  <td className="py-3 px-4">{!m.returned_at ? <Button size="xs" variant="outline" onClick={() => setReturning(m)}>تسجيل عودة</Button> : <CheckCircle2 size={16} className="text-emerald-500" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card> : <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead><tr className="bg-slate-50 border-b border-slate-100">{['الموظف','الوجهة','الصلاحية','المدة','الحالة','إجراء'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}</tr></thead>
            <tbody>
              {permits.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد تصاريح حركة نشطة</td></tr> : permits.map(p => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-800">{employeeMap.get(p.employee_id)?.full_name_ar || p.employee_name || 'موظف'}</td>
                  <td className="py-3 px-4"><span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{p.destination}</span></td>
                  <td className="py-3 px-4 text-slate-500 font-mono">حتى {format(new Date(p.valid_until), 'dd MMM HH:mm', { locale: ar })}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{p.max_duration_minutes} دقيقة</td>
                  <td className="py-3 px-4"><span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">{p.status}</span></td>
                  <td className="py-3 px-4"><Button size="xs" variant="danger" onClick={() => movementPermitService.cancelPermit(p.id).then(loadData)}>إلغاء</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>}

      {showCreate && <MovementModal form={form} setForm={setForm} employees={employees} onClose={() => setShowCreate(false)} onSubmit={createMovement} />}
      {showPermit && <PermitModal form={permitForm} setForm={setPermitForm} employees={employees} onClose={() => setShowPermit(false)} onSubmit={createPermit} />}

      {returning && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReturning(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">تسجيل عودة الموظف</h3>
            <p className="text-sm text-slate-600 mb-3">الوجهة المصرح بها: <strong>{returning.destination}</strong></p>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">الموقع الفعلي</label>
            <select value={actualLocation} onChange={e => setActualLocation(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none mb-4">
              <option value="عاد لمكان الخروج">عاد لمكان الخروج</option>
              {destinations.filter(d => d !== 'أخرى').map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex gap-2"><Button variant="secondary" fullWidth onClick={() => setReturning(null)}>إلغاء</Button><Button fullWidth onClick={confirmReturn}>تأكيد العودة</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function MovementModal({ form, setForm, employees, onClose, onSubmit }: any) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}><div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}><h3 className="text-lg font-bold text-slate-900 mb-4">تسجيل حركة موظف</h3><div className="space-y-3"><Field label="الموظف"><select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"><option value="">اختر موظف...</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></Field><Field label="الوجهة"><select value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400">{destinations.map(d => <option key={d} value={d}>{d}</option>)}</select></Field>{form.destination === 'أخرى' && <Field label="وجهة مخصصة"><input value={form.customDestination} onChange={e => setForm({ ...form, customDestination: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field>}<Field label="الغرض"><input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field><Field label="المدة المتوقعة بالدقائق"><input type="number" min={5} value={form.expected_minutes} onChange={e => setForm({ ...form, expected_minutes: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field><Field label="ملاحظات"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field><div className="flex gap-2 pt-2"><Button variant="secondary" fullWidth onClick={onClose}>إلغاء</Button><Button fullWidth onClick={onSubmit}>حفظ الحركة</Button></div></div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="block text-xs font-bold text-slate-600 mb-1.5">{label}</span>{children}</label>; }

function PermitModal({ form, setForm, employees, onClose, onSubmit }: any) {
  return <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}><div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}><h3 className="text-lg font-bold text-slate-900 mb-4">تصريح حركة مسبق</h3><div className="space-y-3"><Field label="الموظف"><select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"><option value="">اختر موظف...</option>{employees.map((e:any)=><option key={e.id} value={e.id}>{e.full_name_ar || e.email}</option>)}</select></Field><Field label="الوجهة"><select value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400">{destinations.map(d => <option key={d} value={d}>{d}</option>)}</select></Field>{form.destination === 'أخرى' && <Field label="وجهة مخصصة"><input value={form.customDestination} onChange={e => setForm({ ...form, customDestination: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field>}<Field label="الغرض"><input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field><div className="grid grid-cols-2 gap-3"><Field label="صالح لمدة (دقيقة)"><input type="number" min={5} value={form.valid_minutes} onChange={e => setForm({ ...form, valid_minutes: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field><Field label="مدة الخروج"><input type="number" min={5} value={form.max_duration_minutes} onChange={e => setForm({ ...form, max_duration_minutes: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field></div><Field label="ملاحظات"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" /></Field><div className="flex gap-2 pt-2"><Button variant="secondary" fullWidth onClick={onClose}>إلغاء</Button><Button fullWidth onClick={onSubmit}>اعتماد التصريح</Button></div></div></div></div>;
}
