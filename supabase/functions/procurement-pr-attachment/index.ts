/** procurement-pr-attachment — رفع/رابط موقّع لمرفقات PR */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function isProduction(): boolean { return (Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') || 'production') === 'production'; }
function resolveAllowedOrigin(req: Request): string { const origin=req.headers.get('origin')||''; const allow=(Deno.env.get('APP_ORIGIN')||'').split(',').map(o=>o.trim()).filter(Boolean); const local=origin.includes('localhost')||origin.includes('127.0.0.1'); if(origin&&allow.includes(origin)) return origin; if(origin&&local&&!isProduction()) return origin; return ''; }
function headers(req: Request): Record<string,string> { const origin=resolveAllowedOrigin(req); const base:Record<string,string>={'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'}; if(origin) base['Access-Control-Allow-Origin']=origin; return base; }
function json(req: Request, body: unknown, status=200): Response { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function bytesFromBase64(value:string): Uint8Array { const clean=value.includes(',')?value.split(',').pop()||'':value; const bin=atob(clean); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return bytes; }
async function ensureBucket(admin:any,bucket:string){ try{ const {data}=await admin.storage.listBuckets(); if(!Array.isArray(data)||!data.some((b:any)=>b.name===bucket)) await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:10*1024*1024}); }catch(e){ console.warn('bucket ensure failed', e instanceof Error?e.message:String(e)); } }

serve(async (req: Request) => {
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:headers(req)});
  if(req.method!=='POST') return json(req,{error:'Method not allowed'},405);
  const requestOrigin=req.headers.get('origin'); if(requestOrigin&&resolveAllowedOrigin(req)==='') return json(req,{error:'Origin not allowed'},403);
  const supabaseUrl=Deno.env.get('SUPABASE_URL'); const anonKey=Deno.env.get('SUPABASE_ANON_KEY'); const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const authorization=req.headers.get('authorization');
  if(!supabaseUrl||!anonKey||!serviceKey||!authorization?.startsWith('Bearer ')) return json(req,{error:'Auth/config missing'},503);
  const userClient=createClient(supabaseUrl, anonKey, {global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser(); if(authError||!authData.user) return json(req,{error:'جلسة غير صالحة'},401);
  const {data:profile}=await userClient.from('profiles').select('role, tenant_id').eq('id',authData.user.id).single(); if(!profile?.tenant_id) return json(req,{error:'لا توجد شركة'},403);
  const admin=createClient(supabaseUrl, serviceKey, {auth:{persistSession:false}});
  let body:Record<string,unknown>; try{body=await req.json();}catch{return json(req,{error:'حمولة غير صالحة'},400);}
  const action=String(body.action||'upload'); const prId=String(body.pr_id||'').trim(); if(!prId) return json(req,{error:'pr_id مطلوب'},400);
  const {data:pr,error:prErr}=await admin.from('purchase_requisitions').select('id, tenant_id, requester_id, status').eq('id',prId).eq('tenant_id',profile.tenant_id).single();
  if(prErr||!pr) return json(req,{error:'PR غير موجود'},404);
  const privileged=['procurement','admin','manager','finance','developer','it_admin'].includes(String(profile.role));
  if(!privileged && pr.requester_id!==authData.user.id) return json(req,{error:'غير مخول للمرفقات'},403);
  const bucket='pr-attachments';

  if(action==='signed_url'){
    const fileUrl=String(body.file_url||'');
    if(!fileUrl.startsWith(`storage://${bucket}/`)) return json(req,{url:fileUrl});
    const path=fileUrl.replace(`storage://${bucket}/`,'');
    const {data,error}=await admin.storage.from(bucket).createSignedUrl(path, 3600);
    if(error||!data?.signedUrl) return json(req,{error:'تعذر إنشاء رابط مؤقت'},500);
    return json(req,{url:data.signedUrl});
  }

  const fileName=String(body.file_name||'document').trim().slice(0,200); const fileBase64=String(body.file_base64||''); const fileMime=String(body.file_mime||'application/octet-stream');
  if(!fileBase64) return json(req,{error:'file_base64 مطلوب'},400);
  const bytes=bytesFromBase64(fileBase64); if(bytes.byteLength>10*1024*1024) return json(req,{error:'حجم الملف يتجاوز 10MB'},400);
  await ensureBucket(admin,bucket);
  const safe=fileName.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120); const path=`${profile.tenant_id}/${prId}/${crypto.randomUUID()}-${safe}`;
  const {error:upErr}=await admin.storage.from(bucket).upload(path,bytes,{contentType:fileMime,upsert:false}); if(upErr) return json(req,{error:'فشل رفع الملف'},500);
  const fileUrl=`storage://${bucket}/${path}`;
  const {data:att,error:insErr}=await admin.from('pr_attachments').insert({tenant_id:profile.tenant_id,pr_id:prId,file_name:fileName,file_url:fileUrl,file_size:bytes.byteLength,uploaded_by:authData.user.id}).select('id').single();
  if(insErr) return json(req,{error:'تم الرفع لكن فشل تسجيل المرفق'},500);
  await admin.from('pr_audit_log').insert({tenant_id:profile.tenant_id,pr_id:prId,actor_id:authData.user.id,action:'attachment_uploaded',old_status:pr.status,new_status:pr.status,new_value:{attachment_id:att.id,file_name:fileName,file_size:bytes.byteLength}}).catch(()=>undefined);
  return json(req,{ok:true,attachment_id:att.id,file_url:fileUrl});
});
