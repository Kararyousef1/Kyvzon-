/** inventory-receiving-attachment — رفع/رابط موقّع لمرفقات الاستلام وOS&D */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function headers(): Record<string,string> { return {'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'}; }
function json(body: unknown, status=200): Response { return new Response(JSON.stringify(body), {status, headers: headers()}); }
function bytesFromBase64(value:string): Uint8Array { const clean=value.includes(',')?value.split(',').pop()||'':value; const bin=atob(clean); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return bytes; }
async function ensureBucket(admin:any,bucket:string){ const {data}=await admin.storage.listBuckets(); if(!Array.isArray(data)||!data.some((b:any)=>b.name===bucket)) await admin.storage.createBucket(bucket,{public:false,fileSizeLimit:15*1024*1024}); }

serve(async (req: Request) => {
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:headers()});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  const supabaseUrl=Deno.env.get('SUPABASE_URL'); const anonKey=Deno.env.get('SUPABASE_ANON_KEY'); const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const authorization=req.headers.get('authorization');
  if(!supabaseUrl||!anonKey||!serviceKey||!authorization?.startsWith('Bearer ')) return json({error:'Auth/config missing'},503);
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser(); if(authError||!authData.user) return json({error:'جلسة غير صالحة'},401);
  const {data:profile}=await userClient.from('profiles').select('tenant_id,role,email').eq('id',authData.user.id).single();
  if(!profile?.tenant_id || !['inventory','procurement','admin','developer','it_admin'].includes(String(profile.role))) return json({error:'غير مخول'},403);
  const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
  let body:Record<string,unknown>; try{body=await req.json();}catch{return json({error:'حمولة غير صالحة'},400);}
  const bucket='inventory-receiving-documents'; const action=String(body.action||'upload');
  if(action==='signed_url'){
    const fileUrl=String(body.file_url||''); if(!fileUrl.startsWith(`storage://${bucket}/`)) return json({url:fileUrl});
    const path=fileUrl.replace(`storage://${bucket}/`,''); const {data,error}=await admin.storage.from(bucket).createSignedUrl(path,3600);
    if(error||!data?.signedUrl) return json({error:'تعذر إنشاء رابط مؤقت'},500); return json({url:data.signedUrl});
  }
  const entityType=String(body.entity_type||'osd_case'); const entityId=String(body.entity_id||''); const fileName=String(body.file_name||'attachment').slice(0,200); const fileBase64=String(body.file_base64||''); const fileMime=String(body.file_mime||'application/octet-stream');
  if(!entityId||!fileBase64) return json({error:'entity_id و file_base64 مطلوبة'},400);
  const bytes=bytesFromBase64(fileBase64); if(bytes.byteLength>15*1024*1024) return json({error:'حجم الملف يتجاوز 15MB'},400);
  await ensureBucket(admin,bucket); const safe=fileName.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120); const path=`${profile.tenant_id}/${entityType}/${entityId}/${crypto.randomUUID()}-${safe}`;
  const {error:upErr}=await admin.storage.from(bucket).upload(path,bytes,{contentType:fileMime,upsert:false}); if(upErr) return json({error:'فشل رفع الملف'},500);
  const fileUrl=`storage://${bucket}/${path}`;
  const {data:att,error:insErr}=await admin.from('inventory_receiving_attachments').insert({
    tenant_id: profile.tenant_id,
    entity_type: entityType,
    entity_id: entityId,
    file_name: fileName,
    file_url: fileUrl,
    file_mime: fileMime,
    file_size: bytes.byteLength,
    uploaded_by: authData.user.id,
    uploaded_by_email: profile.email || null,
  }).select('id').single();
  if(insErr) return json({error:insErr.message},500);
  return json({ok:true,attachment_id:att?.id,file_url:fileUrl});
});
