// ============================================================================
// Kyvzon Platform
// Edge Function: ZKTeco Biometric Sync
// تستقبل البصمات من جهاز ZKTeco عبر ADMS أو HTTP
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface PunchRequest {
  employee_code: string;
  punch_time: string;
  punch_type?: 'check-in' | 'check-out';
  verification_type?: 'finger' | 'face' | 'card' | 'password';
  device_id?: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  record_id?: number;
  employee_name?: string;
  shift_type?: string;
}

const corsHeaders = {
  // Machine-to-machine callers do not need wildcard browser CORS.
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || 'null',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-adms-timestamp, x-adms-nonce, x-adms-signature',
  'Content-Type': 'application/json',
};

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function verifyRequestSignature(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const timestamp = req.headers.get('x-adms-timestamp') || '';
  const nonce = req.headers.get('x-adms-nonce') || '';
  const signature = req.headers.get('x-adms-signature') || '';
  const timestampMs = Number(timestamp);
  const signatureBytes = hexToBytes(signature);

  if (!timestamp || !nonce || !signatureBytes || !Number.isFinite(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) return false;
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(nonce)) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signedPayload = `${timestamp}.${nonce}.${rawBody}`;
  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(signedPayload),
  );
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET /health
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'zkteco-sync',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          POST: '/api/punch - سجل بصمة واحدة',
          POST_BULK: '/api/punch/bulk - سجل بصمات متعددة',
          GET_HEALTH: '/api/health - فحص الصحة',
        },
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    // Fail closed: لا يجوز تشغيل مزامنة Service Role بدون توقيع HMAC حديث.
    const appSecret = Deno.env.get('ADMS_SECRET');
    if (!appSecret) {
      console.error('ADMS_SECRET is not configured; refusing biometric sync');
      return new Response(
        JSON.stringify({ success: false, error: 'Sync service is not configured' }),
        { status: 503, headers: corsHeaders }
      );
    }

    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ success: false, error: 'Request body too large' }),
        { status: 413, headers: corsHeaders }
      );
    }

    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return new Response(
        JSON.stringify({ success: false, error: 'Request body too large' }),
        { status: 413, headers: corsHeaders }
      );
    }

    if (!(await verifyRequestSignature(req, rawBody, appSecret))) {
      await logSyncError('ADMS', 'توقيع HMAC غير صالح أو منتهي');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid signature' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const nonce = req.headers.get('x-adms-nonce') || '';
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sync service is not configured' }),
        { status: 503, headers: corsHeaders }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await serviceClient
      .from('device_sync_nonces')
      .delete()
      .lt('expires_at', new Date().toISOString());

    const { error: nonceError } = await serviceClient
      .from('device_sync_nonces')
      .insert({
        nonce,
        expires_at: new Date(Date.now() + MAX_CLOCK_SKEW_MS).toISOString(),
      });

    if (nonceError) {
      if (nonceError.code === '23505') {
        return new Response(
          JSON.stringify({ success: false, error: 'Replay detected' }),
          { status: 409, headers: corsHeaders }
        );
      }
      console.error('Nonce persistence failed:', nonceError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Replay protection unavailable' }),
        { status: 503, headers: corsHeaders }
      );
    }

    const body = JSON.parse(rawBody);
    const url = new URL(req.url);
    const path = url.pathname;

    // توجيه حسب المسار
    if (path.endsWith('/api/punch/bulk')) {
      return await handleBulkPunch(body, appSecret);
    } else {
      return await handleSinglePunch(body, appSecret);
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error);
    return new Response(
      JSON.stringify({ success: false, error: `Internal server error: ${error.message}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});

/**
 * معالجة بصمة واحدة
 */
async function handleSinglePunch(body: any, appSecret: string): Promise<Response> {
  const { employee_code, punch_time, punch_type, verification_type, device_id } = body as PunchRequest;

  // التحقق من الحقول المطلوبة
  if (!employee_code || !punch_time) {
    return new Response(
      JSON.stringify({ success: false, error: 'employee_code و punch_time مطلوبان' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseKey);
  const result: SyncResult = { success: false, message: '' };

  try {
    // 1. البحث عن الموظف بالكود
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, employee_code, first_name, last_name')
      .eq('employee_code', employee_code)
      .single();

    if (empError || !employee) {
      result.message = `الموظف بالكود ${employee_code} غير موجود`;
      
      await logSyncError('ADMS', result.message, { employee_code });
      
      return new Response(JSON.stringify(result), { status: 404, headers: corsHeaders });
    }

    // 2. تحديد نوع البصمة من ADMS
    const punchTime = new Date(punch_time);
    const shiftDate = punchTime.toISOString().split('T')[0];

    // استخدام دالة Supabase SQL لتحديد الوردية وحفظ البصمة
    const { data: dbResult, error: dbError } = await supabase.rpc('sync_adms_punch', {
      p_employee_code: employee_code,
      p_punch_time: punchTime.toISOString(),
      p_verification_type: verification_type || 'finger',
      p_device_id: device_id || `ADMS_${punchTime.getTime()}`,
    });

    if (dbError) {
      // إذا فشلت الدالة، نضيف السجل يدوياً
      const { data: insertResult, error: insertError } = await supabase
        .from('attendance_logs')
        .insert({
          employee_id: employee.id,
          punch_time: punchTime.toISOString(),
          punch_type: punch_type || 'check-in',
          shift_date: shiftDate,
          device_id: device_id || `ADMS_${punchTime.getTime()}`,
          verification_type: verification_type || 'finger',
          source: 'ADMS',
          raw_data: { employee_code, request_time: new Date().toISOString() },
        })
        .select('id')
        .single();

      if (insertError) {
        result.message = `فشل حفظ البصمة: ${insertError.message}`;
        
        await logSyncError('ADMS', result.message, { employee_code, error: insertError.message });
        
        return new Response(JSON.stringify(result), { status: 500, headers: corsHeaders });
      }

      result.success = true;
      result.record_id = insertResult.id;
      result.employee_name = `${employee.first_name} ${employee.last_name || ''}`;
      result.message = 'تم حفظ البصمة بنجاح';
    } else {
      result.success = true;
      result.employee_name = `${employee.first_name} ${employee.last_name || ''}`;
      result.shift_type = (dbResult as any)?.shift_type;
      result.message = 'تم حفظ البصمة ومعالجة الوردية';
    }

    // تسجيل عملية المزامنة الناجحة
    await supabase.from('sync_log').insert({
      source: 'ADMS',
      device_id: device_id || 'ADMS',
      records_synced: 1,
      status: 'success',
      details: {
        employee_code,
        employee_name: result.employee_name,
        punch_time: punchTime.toISOString(),
      },
    });

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });

  } catch (error) {
    result.message = `خطأ غير متوقع: ${error.message}`;
    
    await logSyncError('ADMS', result.message, { employee_code });
    
    return new Response(JSON.stringify(result), { status: 500, headers: corsHeaders });
  }
}

/**
 * معالجة بصمات متعددة (Bulk)
 */
async function handleBulkPunch(body: any, appSecret: string): Promise<Response> {
  const records = Array.isArray(body) ? body : body.records;
  
  if (!records || !Array.isArray(records) || records.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'يجب إرسال مصفوفة records' }),
      { status: 400, headers: corsHeaders }
    );
  }

  if (records.length > 500) {
    return new Response(
      JSON.stringify({ success: false, error: 'الحد الأقصى 500 سجل في المرة الواحدة' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results: SyncResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const record of records) {
    const { employee_code, punch_time, punch_type, verification_type, device_id } = record;

    if (!employee_code || !punch_time) {
      results.push({
        success: false,
        message: `employee_code و punch_time مطلوبان في السجل`,
      });
      failCount++;
      continue;
    }

    try {
      const { data: employee } = await supabase
        .from('employees')
        .select('id, employee_code, first_name, last_name')
        .eq('employee_code', employee_code)
        .single();

      if (!employee) {
        results.push({ success: false, message: `الموظف ${employee_code} غير موجود` });
        failCount++;
        continue;
      }

      const punchTime = new Date(punch_time);
      const shiftDate = punchTime.toISOString().split('T')[0];

      const { data: insertResult, error: insertError } = await supabase
        .from('attendance_logs')
        .insert({
          employee_id: employee.id,
          punch_time: punchTime.toISOString(),
          punch_type: punch_type || 'check-in',
          shift_date: shiftDate,
          device_id: device_id || `ADMS_BULK`,
          verification_type: verification_type || 'finger',
          source: 'ADMS',
          raw_data: { employee_code, bulk: true },
        })
        .select('id')
        .single();

      if (insertError) {
        // تجاهل التكرار (constraint unique_employee_punch)
        if (insertError.code === '23505') {
          results.push({ success: true, message: 'مكرر - تم التجاهل' });
          successCount++;
        } else {
          results.push({ success: false, message: insertError.message });
          failCount++;
        }
      } else {
        results.push({
          success: true,
          record_id: insertResult.id,
          employee_name: `${employee.first_name} ${employee.last_name || ''}`,
          message: 'تم الحفظ',
        });
        successCount++;
      }
    } catch (error) {
      results.push({ success: false, message: `خطأ: ${error.message}` });
      failCount++;
    }
  }

  // تسجيل المزامنة
  await supabase.from('sync_log').insert({
    source: 'ADMS',
    device_id: 'ADMS_BULK',
    records_synced: successCount,
    status: failCount > 0 ? 'error' : 'success',
    error_message: failCount > 0 ? `${failCount} سجل فشل من أصل ${records.length}` : null,
    details: { total: records.length, success: successCount, fail: failCount },
  });

  return new Response(
    JSON.stringify({
      success: failCount === 0,
      total: records.length,
      synced: successCount,
      failed: failCount,
      results,
    }),
    { status: failCount > 0 ? 207 : 200, headers: corsHeaders }
  );
}

/**
 * تسجيل خطأ في المزامنة
 */
async function logSyncError(source: string, errorMessage: string, details?: any) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('sync_log').insert({
      source,
      device_id: 'ADMS',
      records_synced: 0,
      status: 'error',
      error_message: errorMessage,
      details: details || {},
    });
  } catch {
    // تجاهل فشل تسجيل الخطأ نفسه
  }
}