/**
 * E00 — مواقع ونقاط التفتيش المعتمدة
 *
 * إصلاحات الجولة السادسة:
 *   1. كان مودال الأرشفة **ميتاً**: الحالة archiveTarget معرَّفة والمودال
 *      مكتوب، لكن لا زر في الجدول يستدعي setArchiveTarget بقيمة. الدالة
 *      archive_movement_location (0285) كانت غير قابلة للوصول من الواجهة.
 *      أُضيف عمود «إجراءات» بزر أرشفة.
 *   2. MovementUnitNav كان مفقوداً من كل صفحات حركة الموظفين الاثنتي عشرة
 *      رغم وجوده في كل صفحات اللوجستيات الثلاث عشرة.
 *   3. منتقي إحداثيات على الخريطة بدل كتابة الأرقام يدوياً — الإدخال
 *      اليدوي مصدر أخطاء صامتة (تبديل lat/lng، فاصلة عشرية مفقودة).
 */
import { useCallback, useEffect, useState } from 'react';
import { Archive, MapPin, Plus , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { movementLocationService } from '../../../../services/sdk/MovementFoundationService';
import type { MovementLocationRecord } from '../../../../shared/types/movement-foundation';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import { CoordinatePicker } from '../shared/MovementMap';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import {
  movementFoundationOperationsService,
  LOCATION_TYPE_LABELS,
  type MovementLocationType,
} from '../../../../services/sdk/MovementFoundationOperationsService';

export default function EmployeeMovementLocationsPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; label: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [form, setForm] = useState({
    nameAr: '', nameEn: '', locationType: 'checkpoint' as MovementLocationType,
    latitude: '', longitude: '', radiusMeters: 50, description: '',
  });
  const [locations, setLocations] = useState<MovementLocationRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await movementLocationService.findAll({ orderBy: 'name_ar', ascending: true });
      setLocations(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* الإنشاء والأرشفة عبر RPCs (0285). الإحداثيات إما معاً أو لا شيء،
     والأرشفة تتطلب سبباً وتُمنع إن كان الموقع في تصاريح نشطة. */
  const submitLocation = async () => {
    setSaving(true);
    try {
      await movementFoundationOperationsService.createLocation({
        nameAr: form.nameAr,
        nameEn: form.nameEn || null,
        locationType: form.locationType,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
        radiusMeters: form.radiusMeters,
        description: form.description || null,
      });
      addToast('تمت إضافة الموقع', 'success');
      setShowCreate(false);
      setForm({ nameAr: '', nameEn: '', locationType: 'checkpoint', latitude: '', longitude: '', radiusMeters: 50, description: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  const submitArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      await movementFoundationOperationsService.archiveLocation(archiveTarget.id, archiveReason);
      addToast('تمت أرشفة الموقع', 'success');
      setArchiveTarget(null); setArchiveReason('');
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="employee_foundation" />
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E00</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><MapPin /> مواقع ونقاط التفتيش المعتمدة</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة بوابات الخروج، المستودعات، والمواقع المسموحة للتنقل.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">موقع جديد</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['الرمز', 'اسم الموقع', 'النوع', 'الإحداثيات (Lat / Lng)', 'نصف القطر (متر)', 'الحالة', 'إجراءات'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد مواقع مسجلة.</td></tr>
              ) : locations.map(l => (
                <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{l.code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{l.name_ar}</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{l.location_type}</span></td>
                  <td className="py-3 px-4 font-mono text-slate-600">{l.latitude ?? '—'} / {l.longitude ?? '—'}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{l.radius_meters ?? 50} م</td>
                  <td className="py-3 px-4">{l.is_active ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> : <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">معطل</span>}</td>
                  <td className="py-3 px-4">
                    {l.is_active ? (
                      <button
                        type="button"
                        onClick={() => { setArchiveReason(''); setArchiveTarget({ id: l.id, label: `${l.code} — ${l.name_ar}` }); }}
                        className="px-2.5 py-1 rounded-lg border text-[11px] font-bold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <Archive size={13} /> أرشفة
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-300">مؤرشف</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[92vh] overflow-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">موقع جديد</h3>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">الاسم بالعربية *</label>
                  <Input value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">الاسم بالإنجليزية</label>
                  <Input value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">نوع الموقع</label>
                <select value={form.locationType} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  onChange={(e) => setForm({ ...form, locationType: e.target.value as MovementLocationType })}>
                  {(Object.keys(LOCATION_TYPE_LABELS) as MovementLocationType[]).map((t) => (
                    <option key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">خط العرض</label>
                  <Input type="number" step="0.0000001" value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">خط الطول</label>
                  <Input type="number" step="0.0000001" value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">نصف قطر السور (م)</label>
                  <Input type="number" value={form.radiusMeters}
                    onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">
                  تحديد الموقع على الخريطة (انقر لضبط الإحداثيات)
                </label>
                <div className="mt-1">
                  <CoordinatePicker
                    value={{
                      lat: form.latitude === '' ? null : Number(form.latitude),
                      lng: form.longitude === '' ? null : Number(form.longitude),
                    }}
                    onChange={(lat, lng) =>
                      setForm((f) => ({ ...f, latitude: String(lat), longitude: String(lng) }))
                    }
                    radiusMeters={form.radiusMeters}
                    height={300}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
                  <p className="text-[11px] text-slate-400">
                    الدائرة الخضراء = السور الجغرافي بنصف القطر أعلاه · خرائط © مساهمو OpenStreetMap
                  </p>
                  {(form.latitude !== '' || form.longitude !== '') && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, latitude: '', longitude: '' }))}
                      className="text-[11px] font-bold text-rose-600 hover:underline"
                    >
                      مسح الإحداثيات
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">الوصف</label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <p className="text-[11px] text-slate-400">
                الإحداثيات تُدخَل معاً أو تُترك فارغة. الموقع بلا إحداثيات لا يصلح
                لتخطيط المسارات ولا للتحقق من السور الجغرافي.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitLocation()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h3 className="font-bold text-lg mb-1">أرشفة الموقع</h3>
            <p className="text-sm text-slate-500 mb-4">{archiveTarget.label}</p>
            <label className="text-xs font-bold text-slate-600">سبب الأرشفة (إلزامي)</label>
            <textarea value={archiveReason} rows={3}
              onChange={(e) => setArchiveReason(e.target.value)}
              className="w-full border rounded-xl p-2.5 text-sm mt-1"
              placeholder="مثال: أُغلق الفرع نهائياً" />
            <p className="text-[11px] text-slate-400 mt-2">
              لا حذف نهائي — الأرشفة تُخفي الموقع وتُبقي التاريخ سليماً.
            </p>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => void submitArchive()} loading={saving} className="flex-1">أرشفة</Button>
              <Button variant="secondary" onClick={() => setArchiveTarget(null)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
