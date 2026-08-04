import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import { contractVersionService } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

export default function VersionsPage() {
  const { addToast } = useUIStore();
  const [versions, setVersions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [prev, setPrev] = useState<any>(null);

  useEffect(()=>{
    (async()=>{
      try {
        const data = await contractVersionService.findAll({ orderBy: 'created_at', ascending: false, limit: 50 });
        setVersions(data);
      } catch(e:any){ addToast(e.message,'error'); }
    })();
  }, []);

  const loadDiff = async (v: any) => {
    setSelected(v);
    const idx = versions.findIndex(x=>x.id===v.id);
    if (idx+1 < versions.length) {
      setPrev(versions[idx+1]);
    } else {
      setPrev(null);
    }
  };

  const renderDiff = (oldContent: string, newContent: string) => {
    const oldLines = (oldContent || '').split('\n');
    const newLines = (newContent || '').split('\n');
    const max = Math.max(oldLines.length, newLines.length);
    const diff: Array<{ type: 'added'|'removed'|'same', text: string }> = [];
    for (let i=0;i<max;i++) {
      const o = oldLines[i];
      const n = newLines[i];
      if (o===n) diff.push({ type: 'same', text: o || '' });
      else {
        if (o) diff.push({ type: 'removed', text: o });
        if (n) diff.push({ type: 'added', text: n });
      }
    }
    return diff;
  };

  const diff = selected ? renderDiff(prev?.content || '', selected.content) : [];

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-black">إدارة الإصدارات — Version Control + Redlining تعاوني</h1>
        <p className="text-sm text-slate-500 mt-1">نسخة واحدة في السحاب — كل تعديل ملون أخضر جديد/أحمر محذوف — تاريخ تفاوض كامل — v1.0 الموقعة لا تُعدل أبداً — عبر SDK فقط</p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <Card className="md:col-span-1">
          <h3 className="font-bold mb-3">إصدارات ({versions.length})</h3>
          <div className="space-y-2 max-h-[70vh] overflow-auto">
            {versions.map(v=>(
              <button key={v.id} onClick={()=>loadDiff(v)} className={`w-full text-right p-3 border rounded-xl text-sm ${selected?.id===v.id ? 'bg-indigo-50 border-indigo-300' : 'bg-white hover:bg-slate-50'}`}>
                <div className="flex justify-between"><span className="font-mono font-bold">{v.version_number}</span><span className="text-[10px] text-slate-400">{new Date(v.created_at).toLocaleDateString('ar-SA')}</span></div>
                <div className="text-xs text-slate-500 truncate mt-1">{v.change_summary || 'بدون ملخص'}</div>
                {v.version_number==='v1.0' && <div className="text-[10px] mt-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-block">موقعة — لا تُعدل</div>}
              </button>
            ))}
            {!versions.length && <div className="py-10 text-center text-slate-400 text-sm">لا إصدارات</div>}
          </div>
        </Card>

        <Card className="md:col-span-2">
          <h3 className="font-bold mb-3">Redlining — {selected ? `${prev?.version_number || 'لا يوجد'} → ${selected.version_number}` : 'اختر إصدار'}</h3>
          {!selected ? <div className="py-20 text-center text-slate-400">اختر إصدار</div> : (
            <div className="space-y-1 max-h-[70vh] overflow-auto font-mono text-xs p-3 bg-slate-50 rounded-xl border">
              {diff.map((d,i)=>(
                <div key={i} className={`px-2 py-1 rounded ${d.type==='added' ? 'bg-emerald-100 text-emerald-800 border-l-4 border-emerald-500' : d.type==='removed' ? 'bg-red-100 text-red-800 border-l-4 border-red-500 line-through' : 'bg-white'}`}>
                  <span className="mr-2">{d.type==='added' ? '+ ' : d.type==='removed' ? '- ' : '  '}</span>{d.text}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
