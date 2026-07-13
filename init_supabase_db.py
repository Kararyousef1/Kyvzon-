"""
🍃 إعداد قاعدة بيانات Supabase الجديدة
يرسل كل عبارة SQL عبر Supabase PostgreSQL مباشرة باستخدام service_role key
"""
import json
import httpx
import os
import time

# قراءة الإعدادات
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

project_ref = supabase_url.replace('https://', '').split('.')[0]
print(f"✅ Supabase URL: {supabase_url}")
print(f"✅ Project Ref: {project_ref}")

# قراءة ملف schema.sql
with open('database/schema.sql', 'r', encoding='utf-8') as f:
    sql_content = f.read()

print(f"📄 schema.sql: {len(sql_content)} حرف")

# تقسيم SQL إلى عبارات منفصلة (حسب الفاصلة المنقوطة مع الحفاظ على الـ $$)
# نحتاج تقسيم ذكي يحترم function bodies
statements = []
current_stmt = ""
depth = 0  # لتعقب $$ opening/closing
in_string = False
in_dollar_tag = False

for line in sql_content.split('\n'):
    stripped = line.strip()
    
    # نتخطى التعليقات التي تأخذ سطر كامل
    if stripped.startswith('--') and not in_dollar_tag:
        if current_stmt:
            current_stmt += line + '\n'
        continue
    
    # تتبع الـ dollar quoting ($$)
    if '$$' in line:
        count = line.count('$$')
        if count % 2 == 1:
            in_dollar_tag = not in_dollar_tag
    
    current_stmt += line + '\n'
    
    # إذا كانت العبارة منتهية بفاصلة منقوطة ولسنا داخل دالة
    if stripped.endswith(';') and not in_dollar_tag:
        statements.append(current_stmt.strip())
        current_stmt = ""

# إضافة آخر عبارة إذا بقيت
if current_stmt.strip():
    statements.append(current_stmt.strip())

print(f"📊 عدد عبارات SQL: {len(statements)}")

# استخدام Supabase REST API لتنفيذ SQL
endpoint = f"https://api.supabase.com/v1/projects/{project_ref}/sql"
success_count = 0
error_count = 0

headers = {
    'Authorization': f'Bearer {service_key}',
    'Content-Type': 'application/json',
}

print(f"\n🚀 بدء إرسال SQL إلى Supabase...")

# الخيار الأفضل: إرسال SQL كامل
print(f"\n📦 محاولة إرسال SQL كامل مرة واحدة...")
payload = json.dumps({"query": sql_content}).encode('utf-8')

try:
    with httpx.Client(timeout=180) as client:
        response = client.post(endpoint, headers=headers, content=payload)
        if response.status_code == 200:
            print(f"✅ تم تشغيل SQL بنجاح!")
            print(f"📝 {response.text[:300]}")
            success_count = len(statements)
        elif response.status_code == 403:
            error_body = response.text
            print(f"❌ خطأ 403: {error_body[:200]}")
            
            # محاولة بديلة: استخدام PAT token
            print("\n🔄 محاولة استخدام طريقة SQL المباشرة عبر service_role key...")
            
            # استخدام PostgREST endpoint لتشغيل استعلامات SQL
            # هذا يتطلب تثبيت supabase CLI أو استخدام rpc
            sql_endpoint = f"{supabase_url}/rest/v1/rpc/"
            
            for i, stmt in enumerate(statements):
                if len(stmt) < 10:
                    continue
                    
                try:
                    # استخدام PostgREST query parameter للـ SQL
                    # نقوم بإرسال كاستعلام select
                    rpc_payload = {"query": stmt}
                    rpc_response = client.post(
                        sql_endpoint,
                        headers={
                            'apikey': service_key,
                            'Authorization': f'Bearer {service_key}',
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                        },
                        json=rpc_payload,
                        timeout=30
                    )
                    
                    if rpc_response.status_code == 200:
                        success_count += 1
                    elif rpc_response.status_code == 404:
                        # هذا متوقع لأن rpc قد لا يكون موجوداً
                        break
                    else:
                        error_count += 1
                except Exception as e:
                    error_count += 1
                    
            if success_count == 0:
                print("\n❌ لم نتمكن من تشغيل SQL عبر API.")
                print("\n⚠️  يرجى تشغيل SQL يدوياً:")
                print("   1. اذهب إلى https://supabase.com/dashboard")
                print("   2. ادخل إلى مشروع ukqxxalosnmzsgothpps")
                print("   3. افتح SQL Editor")
                print("   4. الصق محتوى database/schema.sql")
                print("   5. شغّل الاستعلام")
        else:
            print(f"❌ خطأ {response.status_code}: {response.text[:300]}")
except Exception as e:
    print(f"❌ خطأ في الاتصال: {e}")
    print("\n⚠️  يرجى تشغيل SQL يدوياً من Supabase Dashboard")

print(f"\n✅ تم بنجاح: {success_count}/{len(statements)} عبارة")
print(f"❌ أخطاء: {error_count}/{len(statements)} عبارة")
print("\n✨ انتهى")