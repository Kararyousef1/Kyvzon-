/** procurement-supplier-invoice — قناة بوابة المورد لرفع الفواتير */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
function isProduction(){return (Deno.env.get('DENO_ENV')||Deno.env.get('APP_ENV')||'production')==='production'}
function origin(req:Request){const o=req.headers.get('origin')||'';const a=(Deno.env.get('APP_ORIGIN')||'').split(',').map(x=>x.trim()).filter(Boolean);const l=o.includes('localhost')||o.includes('127.0.0.1');if(o&&a.includes(o))return o;if(o&&l&&!isProduction())return o;return ''}
function headers(req:Request){const o=origin(req);const h:Record<string,string>={'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'};if(o)h['Access-Control-Allow-Origin']=o;return h}
function json(req:Request,b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:headers(req)})}
async function sha256Hex(v:string){const d=new TextEncoder().encode(v);const h=await crypto.subtle.digest('SHA-256',d);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function txt(v:unknown,max=500){if(v===undefined||v===null)return null;const s=String(v).trim();return s?s.slice(0,max):null}
function num(v:unknown){const n=Number(v);return Number.isFinite(n)?n:0}

serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)}); if(req.method!=='POST')return json(req,{error:'Method not allowed'},405);
 const o=req.headers.get('origin'); if(o&&origin(req)==='')return json(req,{error:'Origin not allowed'},403);
 const supabaseUrl=Deno.env.get('SUPABASE_URL'); const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if(!supabaseUrl||!serviceKey)return json(req,{error:'Service not configured'},503);
 let body:Record<string,unknown>; try{body=await req.json()}catch{return json(req,{error:'حمولة غير صالحة'},400)}
 const action=String(body.action||'verify'); const token=String(body.token||'').trim(); if(!token)return json(req,{error:'token مطلوب'},400);
 const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}}); const tokenHash=await sha256Hex(token);
 const {data:inv,error:invErr}=await admin.from('supplier_portal_invites').select('tenant_id,supplier_id,email,expires_at').eq('token_hash',tokenHash).maybeSingle();
 if(invErr||!inv)return json(req,{error:'رابط المورد غير صالح'},404); if(new Date(inv.expires_at).getTime()<Date.now())return json(req,{error:'انتهت صلاحية رابط المورد'},410);
 const {data:supplier}=await admin.from('suppliers').select('id,legal_name,status').eq('id',inv.supplier_id).eq('tenant_id',inv.tenant_id).single(); if(!supplier)return json(req,{error:'المورد غير موجود'},404);
 if(action==='verify'){
   const {data:pos}=await admin.from('purchase_orders').select('id,po_number,total_amount,currency_code,status').eq('tenant_id',inv.tenant_id).eq('supplier_id',inv.supplier_id).in('status',['sent','acknowledged','shipped','partially_received','received']);
   return json(req,{ok:true,supplier,pos:pos||[]});
 }
 const poId=txt(body.po_id,80); const invoiceNumber=txt(body.invoice_number,120); const invoiceDate=txt(body.invoice_date,20); const amount=num(body.amount_before_tax); const tax=num(body.tax_rate)||15; const lines=Array.isArray(body.lines)?body.lines as Record<string,unknown>[]:[];
 if(!invoiceNumber||!invoiceDate||!lines.length)return json(req,{error:'رقم الفاتورة والتاريخ والبنود مطلوبة'},400);
 if(poId){const {data:po}=await admin.from('purchase_orders').select('id').eq('id',poId).eq('tenant_id',inv.tenant_id).eq('supplier_id',inv.supplier_id).maybeSingle(); if(!po)return json(req,{error:'PO غير صالح لهذا المورد'},403)}
 const {data:invoice,error:createErr}=await admin.from('supplier_invoices').insert({tenant_id:inv.tenant_id,supplier_id:inv.supplier_id,po_id:poId,invoice_number:invoiceNumber,invoice_date:invoiceDate,amount_before_tax:amount,tax_rate:tax,currency_code:txt(body.currency_code,3)||'SAR',payment_due_date:txt(body.payment_due_date,20),payment_terms:txt(body.payment_terms,40)||'Net45',bank_account:txt(body.bank_account,120),source:'supplier_portal'}).select('id,total_amount').single();
 if(createErr)return json(req,{error:'تعذر إنشاء الفاتورة'},500);
 const rows=lines.map(l=>({tenant_id:inv.tenant_id,invoice_id:invoice.id,po_line_item_id:txt(l.po_line_item_id,80),item_code:txt(l.item_code,120),description:txt(l.description,500)||'بند فاتورة',quantity:num(l.quantity)||1,unit_price:num(l.unit_price),tax_rate:num(l.tax_rate)||tax}));
 await admin.from('invoice_line_items').insert(rows);
 await admin.from('invoice_audit_log').insert({tenant_id:inv.tenant_id,invoice_id:invoice.id,action:'supplier_portal_invoice_submitted',new_status:'pending_match',new_value:{invoice_number:invoiceNumber,total:invoice.total_amount},comments:'Submitted by supplier portal'}).catch(()=>undefined);
 return json(req,{ok:true,invoice_id:invoice.id,message:'تم رفع الفاتورة للمراجعة والمطابقة'});
});
