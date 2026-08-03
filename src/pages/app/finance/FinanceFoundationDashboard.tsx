import { useEffect, useState } from 'react';
import { Building2, CalendarClock, FolderKanban, Layers, RefreshCw } from 'lucide-react';
import { supabase } from '../../../services/supabase/supabase';
import { FinanceUnitNav } from './shared/FinanceUnitNav';

type Row = Record<string, number | string | null>;
const cards = [
  ['active_legal_entities','كيانات نشطة',Building2],['open_fiscal_years','سنوات مفتوحة',CalendarClock],['open_periods','فترات مفتوحة',CalendarClock],['active_cost_centers','مراكز تكلفة',Layers],['active_projects','مشاريع نشطة',FolderKanban],['approved_exchange_rates','أسعار صرف',RefreshCw]
] as const;
export default function FinanceFoundationDashboard(){const[rows,setRows]=useState<Row[]>([]);const[loading,setLoading]=useState(false);const load=async()=>{setLoading(true);try{const{data}=await supabase.from('finance_foundation_dashboard').select('*').limit(1);setRows((data||[]) as Row[])}finally{setLoading(false)}};useEffect(()=>{void load()},[]);const row=rows[0]||{};return <div dir="rtl" className="space-y-5 max-w-[1600px] mx-auto"><div className="flex justify-between gap-3 flex-wrap"><div><p className="text-sm font-bold text-emerald-700">Finance Foundation</p><h1 className="text-3xl font-black">الأساس المالي ولوحة التحكم</h1><p className="text-slate-500 mt-2">ابدأ من هنا لإدارة الكيانات، الفترات، العضويات، مراكز التكلفة، المشاريع وأسعار الصرف.</p></div><button onClick={()=>void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1"/>تحديث</button></div><FinanceUnitNav unit="foundation"/><div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">{cards.map(([k,l,I])=><div key={k} className="bg-white border rounded-2xl p-4"><I className="text-emerald-600 mb-2" size={20}/><p className="text-2xl font-black">{String(row[k]??(loading?'…':'0'))}</p><p className="text-xs text-slate-500 mt-1">{l}</p></div>)}</div></div>}
