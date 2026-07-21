/**
 * CalendarPage — تقويم المحتوى الشهري مع ترميز لوني (مجدول/منشور/فشل) وفلترة.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { usePosts, POST_STATUS_LABEL } from './useSocial';

const DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const DOT: Record<string, string> = { scheduled: 'bg-sky-500', published: 'bg-emerald-500', failed: 'bg-rose-500', draft: 'bg-slate-400' };

export default function CalendarPage() {
  const { data: posts, loading } = usePosts();
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const monthPosts = useMemo(() => {
    const map = new Map<string, typeof posts>();
    for (const p of posts) {
      const dt = p.scheduled_at || p.published_at;
      if (!dt) continue;
      const key = new Date(dt).toDateString();
      const arr = map.get(key) || [];
      arr.push(p); map.set(key, arr);
    }
    return map;
  }, [posts]);

  const year = cursor.getFullYear(); const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthName = cursor.toLocaleDateString('ar', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronRight size={16} /></button>
          <h2 className="font-black text-slate-800 text-lg">{monthName}</h2>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"><ChevronLeft size={16} /></button>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {(['scheduled', 'published', 'failed'] as const).map((s) => (
            <span key={s} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-full ${DOT[s]}`} /> {POST_STATUS_LABEL[s]}</span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS.map((d) => <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} className="aspect-square" />;
            const dayPosts = monthPosts.get(date.toDateString()) || [];
            const isToday = date.toDateString() === new Date().toDateString();
            return (
              <div key={i} className={`aspect-square rounded-lg border p-1.5 text-right overflow-hidden ${isToday ? 'border-fuchsia-300 bg-fuchsia-50/40' : 'border-slate-100'}`}>
                <div className="text-[11px] text-slate-500">{date.getDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {dayPosts.slice(0, 2).map((p) => (
                    <div key={p.id} className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[p.status]}`} />
                      <span className="text-[9px] text-slate-500 truncate">{p.content.slice(0, 12)}</span>
                    </div>
                  ))}
                  {dayPosts.length > 2 && <div className="text-[9px] text-slate-400">+{dayPosts.length - 2}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {loading && <p className="text-center text-slate-400 text-sm">جارٍ التحميل…</p>}
    </div>
  );
}
