import urllib.request
import json
import os

# قراءة معلومات الاتصال من ملف .env
supabase_url = None
service_key = None

with open('.env', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line.startswith('VITE_SUPABASE_URL='):
            supabase_url = line.split('=', 1)[1].strip()
        elif line.startswith('VITE_SUPABASE_SERVICE_KEY='):
            service_key = line.split('=', 1)[1].strip()

if not supabase_url or not service_key:
    print("❌ لم يتم العثور على VITE_SUPABASE_URL أو VITE_SUPABASE_SERVICE_KEY في .env")
    exit(1)

# استخراج project ref من الرابط
project_ref = supabase_url.replace('https://', '').split('.')[0]
print(f"✅ رابط Supabase: {supabase_url}")
print(f"✅ Project Ref: {project_ref}")

# قراءة schema.sql
with open('database/schema.sql', 'r', encoding='utf-8') as f:
    sql_content = f.read()

print(f"📄 تم تحميل schema.sql ({len(sql_content)} حرف)")

# استخدام Supabase Management API لتشغيل SQL
# هذا الـ endpoint يتطلب service_role key
endpoint = f"https://api.supabase.com/v1/projects/{project_ref}/sql"

headers = {
    'Authorization': f'Bearer {service_key}',
    'Content-Type': 'application/json',
}

# نرسل SQL كامل في طلب واحد
payload = json.dumps({"query": sql_content}).encode('utf-8')

print(f"\n🚀 جاري إرسال SQL إلى Supabase Management API...")
print(f"   Endpoint: {endpoint}")

req = urllib.request.Request(endpoint, data=payload, headers=headers, method='POST')

try:
    with urllib.request.urlopen(req, timeout=180) as response:
        result = response.read().decode('utf-8')
        print(f"\n✅ تم تشغيل SQL بنجاح!")
        print(f"📝 {result[:500]}")
except urllib.error.HTTPError as e:
    error_body = e.read().decode('utf-8')
    print(f"\n❌ خطأ HTTP {e.code}")
    print(f"❌ {error_body[:500]}")
    
    if e.code == 403:
        print("\n⚠️  المفتاح الحالي ليس لديه صلاحية Management API.")
        print("   تحتاج إلى استخدام Personal Access Token (PAT) من Supabase Dashboard:")
        print("   1. اذهب إلى https://supabase.com/dashboard/account/tokens")
        print("   2. أنشئ Access Token جديد")
        print("   3. شغّل هذا الأمر بدلاً من ذلك:")
        print(f"\n   curl -X POST '{endpoint}' \\")
        print(f"     -H 'Authorization: Bearer YOUR_PAT_TOKEN' \\")
        print(f"     -H 'Content-Type: application/json' \\")
        print(f"     -d '{{\"query\": \"$(cat database/schema.sql | tr '\\n' ' ')\"}}'")
    elif e.code == 404:
        print("\n⚠️  لم يتم العثور على المشروع. تأكد من صحة الرابط.")
except Exception as e:
    print(f"\n❌ خطأ غير متوقع: {e}")

print("\n✨ انتهى")