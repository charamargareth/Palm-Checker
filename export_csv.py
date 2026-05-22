import os
import csv

print("✅ Script mulai jalan...")

try:
    from dotenv import load_dotenv
    print("✅ dotenv OK")
except ImportError:
    print("❌ python-dotenv belum install. Jalankan: pip install python-dotenv")
    exit()

try:
    from supabase import create_client
    print("✅ supabase OK")
except ImportError:
    print("❌ supabase belum install. Jalankan: pip install supabase")
    exit()

load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

print(f"SUPABASE_URL: {SUPABASE_URL}")
print(f"SUPABASE_KEY: {'ada' if SUPABASE_KEY else 'TIDAK ADA'}")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ .env.local tidak terbaca. Pastikan file .env.local ada di folder Palm-Checker")
    exit()

print("📡 Konek ke Supabase...")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("📡 Ambil data checklist...")
checklists = supabase.table('checklist').select('image_id, user_name, user_label').execute().data
print(f"✅ Checklist ditemukan: {len(checklists)} rows")

USERS = ['pak_jos', 'pak_handy', 'pak_aris', 'pak_legiso']

image_ids = list(set(c['image_id'] for c in checklists))
print(f"📡 Ambil data images untuk {len(image_ids)} image_id unik...")

images = supabase.table('images').select('id, filename, folder_id, cvat_label').in_('id', image_ids).execute().data
images_map = {img['id']: img for img in images}
print(f"✅ Images ditemukan: {len(images)} rows")

rows = []
for img_id, img in images_map.items():
    votes = [c for c in checklists if c['image_id'] == img_id]
    vote_map = {v['user_name']: v['user_label'] for v in votes}

    pruning_count = sum(1 for v in votes if v['user_label'] == 'pruning')
    underpruning_count = sum(1 for v in votes if v['user_label'] == 'underpruning')
    total = pruning_count + underpruning_count

    if total == 0:
        majority = '-'
    elif pruning_count > underpruning_count:
        majority = 'pruning'
    elif underpruning_count > pruning_count:
        majority = 'underpruning'
    else:
        majority = 'tie'

    row = {
        'image_id': img_id,
        'filename': img['filename'],
        'folder_id': img['folder_id'],
        'cvat_label': img['cvat_label'],
    }
    for user in USERS:
        row[user] = vote_map.get(user, '-')

    row['pruning_count'] = pruning_count
    row['underpruning_count'] = underpruning_count
    row['majority_vote'] = majority
    rows.append(row)

rows.sort(key=lambda x: (x['folder_id'], x['filename']))

output_file = 'checklist_export.csv'
fieldnames = ['image_id', 'filename', 'folder_id', 'cvat_label'] + USERS + ['pruning_count', 'underpruning_count', 'majority_vote']

with open(output_file, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"✅ Export selesai! File: {output_file} ({len(rows)} frame)")