import { useEffect, useMemo, useState } from 'react';
import { inventoryStorageAnalyticsService } from '../../../../services/sdk';

type LocationRow = Record<string, unknown>;

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value: unknown, fallback = '—'): string {
  const out = value === null || value === undefined ? '' : String(value);
  return out || fallback;
}

function capacityColor(percent: number | null): string {
  if (percent === null) return 'bg-slate-100 border-slate-300 text-slate-600';
  if (percent >= 90) return 'bg-red-100 border-red-300 text-red-800';
  if (percent >= 85) return 'bg-orange-100 border-orange-300 text-orange-800';
  if (percent >= 50) return 'bg-amber-100 border-amber-300 text-amber-800';
  if (percent > 0) return 'bg-emerald-100 border-emerald-300 text-emerald-800';
  return 'bg-white border-slate-200 text-slate-600';
}

function heatColor(level: string): string {
  if (level === 'hot') return 'bg-red-100 border-red-300 text-red-800';
  if (level === 'warm') return 'bg-amber-100 border-amber-300 text-amber-800';
  return 'bg-sky-50 border-sky-200 text-sky-800';
}

export default function VisualWarehouseMapPage() {
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [heatmap, setHeatmap] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'capacity' | 'heat'>('capacity');
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<LocationRow | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      inventoryStorageAnalyticsService.locationMap(),
      inventoryStorageAnalyticsService.heatmap(),
    ])
      .then(([mapRows, heatRows]) => {
        if (!mounted) return;
        setLocations(mapRows || []);
        setHeatmap(heatRows || []);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const heatByLocation = useMemo(() => {
    const m = new Map<string, LocationRow>();
    for (const h of heatmap) m.set(String(h.location_id), h);
    return m;
  }, [heatmap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((row) =>
      [row.full_location_code, row.location_code, row.warehouse_code, row.zone_code]
        .some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }, [locations, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, LocationRow[]>();
    for (const row of filtered) {
      const key = `${text(row.warehouse_code, 'WH')} / ${text(row.zone_code, 'ZONE')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)?.push(row);
    }
    return [...groups.entries()].map(([key, rows]) => [
      key,
      rows.sort((a, b) => String(a.full_location_code || a.location_code).localeCompare(String(b.full_location_code || b.location_code))),
    ] as const);
  }, [filtered]);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex justify-between gap-3 flex-wrap items-start">
        <div>
          <h1 className="text-3xl font-black">الخريطة التفاعلية للمستودع</h1>
          <p className="text-slate-500 mt-1">عرض مرئي للمواقع مع ألوان الامتلاء أو Heatmap النشاط، وبحث وتكبير وتفاصيل فورية.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMode('capacity')} className={`px-3 py-2 rounded-xl text-sm font-bold ${mode === 'capacity' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>الامتلاء</button>
          <button onClick={() => setMode('heat')} className={`px-3 py-2 rounded-xl text-sm font-bold ${mode === 'heat' ? 'bg-indigo-600 text-white' : 'bg-white border'}`}>Heatmap</button>
          <button onClick={() => setZoom((z) => Math.max(0.65, +(z - 0.1).toFixed(2)))} className="px-3 py-2 rounded-xl text-sm bg-white border">-</button>
          <span className="px-3 py-2 rounded-xl text-sm bg-slate-100 font-mono">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} className="px-3 py-2 rounded-xl text-sm bg-white border">+</button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4 shadow-sm">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن موقع، مستودع، منطقة..."
          className="w-full border rounded-xl px-4 py-3 text-sm"
        />
      </div>

      {loading ? <div className="p-10 text-center text-slate-500">جاري تحميل الخريطة...</div> : (
        <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
          <div className="bg-slate-50 border rounded-2xl p-4 overflow-auto min-h-[520px]">
            <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top right', width: `${100 / zoom}%` }} className="space-y-6 transition-transform">
              {grouped.map(([group, rows]) => (
                <section key={group} className="bg-white rounded-2xl border p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-black text-slate-800">{group}</h2>
                    <span className="text-xs text-slate-500">{rows.length} موقع</span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
                    {rows.map((row) => {
                      const id = String(row.location_id);
                      const heat = heatByLocation.get(id);
                      const percentRaw = row.capacity_percent === null || row.capacity_percent === undefined ? null : asNumber(row.capacity_percent);
                      const cls = mode === 'heat' ? heatColor(String(heat?.heat_level || 'cold')) : capacityColor(percentRaw);
                      return (
                        <button
                          key={id}
                          onClick={() => setSelected({ ...row, ...(heat || {}) })}
                          className={`border rounded-xl p-2 text-right hover:ring-2 hover:ring-indigo-400 transition ${cls}`}
                          title={text(row.full_location_code || row.location_code)}
                        >
                          <div className="font-black text-xs truncate">{text(row.full_location_code || row.location_code)}</div>
                          <div className="text-[11px] mt-1">{mode === 'heat' ? `حركة: ${text(heat?.movement_30d, '0')}` : `امتلاء: ${percentRaw === null ? '—' : percentRaw + '%'}`}</div>
                          <div className="text-[10px] opacity-80">{text(row.status)}</div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!grouped.length && <div className="p-10 text-center text-slate-400">لا توجد مواقع مطابقة للبحث.</div>}
            </div>
          </div>

          <aside className="bg-white border rounded-2xl p-5 shadow-sm sticky top-4">
            <h3 className="font-black mb-3">تفاصيل الموقع</h3>
            {selected ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-500">الكود</dt><dd className="font-mono text-xs">{text(selected.full_location_code || selected.location_code)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">المستودع</dt><dd>{text(selected.warehouse_code)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">المنطقة</dt><dd>{text(selected.zone_code)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">النوع</dt><dd>{text(selected.location_type)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">الحالة</dt><dd>{text(selected.status)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">الامتلاء</dt><dd>{text(selected.capacity_percent, '—')}%</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">الرصيد</dt><dd>{text(selected.on_hand_qty, '0')}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">عدد الأصناف</dt><dd>{text(selected.item_count, '0')}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">حركة 30 يوم</dt><dd>{text(selected.movement_30d, '0')}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Heat</dt><dd>{text(selected.heat_level, 'cold')}</dd></div>
              </dl>
            ) : <div className="text-sm text-slate-400">اختر موقعاً من الخريطة لعرض التفاصيل.</div>}
          </aside>
        </div>
      )}
    </div>
  );
}
