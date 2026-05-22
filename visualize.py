import os
import sys
import urllib.request
import io
from collections import defaultdict

try:
    import matplotlib.pyplot as plt
    import matplotlib.gridspec as gridspec
    from matplotlib.patches import FancyBboxPatch
    import numpy as np
    from PIL import Image
    from supabase import create_client
    from dotenv import load_dotenv
except ImportError as e:
    print(f"❌ Missing library: {e}")
    print("Run: pip install matplotlib pillow supabase python-dotenv")
    sys.exit(1)

# ==========================
# CONFIG — sesuaikan path .env.local
# ==========================
load_dotenv('.env.local')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ SUPABASE_URL dan SUPABASE_KEY tidak ditemukan di .env.local")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USERS = ['pak_jos', 'pak_handy', 'pak_aris', 'pak_legiso']
USER_DISPLAY = {
    'pak_jos': 'Pak Jos',
    'pak_handy': 'Pak Handy',
    'pak_aris': 'Pak Aris',
    'pak_legiso': 'Pak Legiso',
}
COLORS = {
    'pruning': '#3B6D11',
    'underpruning': '#993C1D',
    'tie': '#854F0B',
    '-': '#888888',
}

# ==========================
# LOAD DATA FROM SUPABASE
# ==========================
def load_data():
    print("📡 Mengambil data dari Supabase...")

    # Ambil semua checklist
    checklist_res = supabase.table('checklist').select('image_id, user_name, user_label').execute()
    checklists = checklist_res.data

    # Ambil semua images yang ada di checklist
    image_ids = list(set(c['image_id'] for c in checklists))
    
    if not image_ids:
        print("❌ Tidak ada data checklist.")
        sys.exit(1)

    images_res = supabase.table('images').select('id, filename, image_url, folder_id, cvat_label').in_('id', image_ids).execute()
    images = {img['id']: img for img in images_res.data}

    # Susun per frame
    frames = {}
    for img_id, img in images.items():
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

        frames[img_id] = {
            'filename': img['filename'],
            'image_url': img['image_url'],
            'cvat_label': img['cvat_label'],
            'folder_id': img['folder_id'],
            'vote_map': vote_map,
            'pruning_count': pruning_count,
            'underpruning_count': underpruning_count,
            'total': total,
            'majority': majority,
        }

    frame_list = sorted(frames.values(), key=lambda x: (x['folder_id'], x['filename']))
    print(f"✅ {len(frame_list)} frame ditemukan.")
    return frame_list

# ==========================
# LOAD IMAGE FROM URL
# ==========================
def load_image_from_url(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            img_data = response.read()
        return Image.open(io.BytesIO(img_data))
    except Exception as e:
        print(f"⚠️ Gagal load gambar: {e}")
        return None

# ==========================
# DRAW FRAME
# ==========================
def draw_frame(fig, frame, index, total):
    fig.clear()

    gs = gridspec.GridSpec(1, 2, width_ratios=[3, 1], figure=fig)
    gs.update(wspace=0.05)

    ax_img = fig.add_subplot(gs[0])
    ax_info = fig.add_subplot(gs[1])

    # Load gambar
    img = load_image_from_url(frame['image_url'])
    if img:
        ax_img.imshow(img)
    else:
        ax_img.set_facecolor('#111')
        ax_img.text(0.5, 0.5, 'Gagal load gambar', color='white',
                   ha='center', va='center', transform=ax_img.transAxes, fontsize=12)

    ax_img.axis('off')
    ax_img.set_title(
        f"{frame['filename']}   |   {index+1} / {total}   |   Folder {frame['folder_id']}   |   CVAT: {frame['cvat_label']}",
        fontsize=9, color='#333', pad=8, loc='left'
    )

    # ==========================
    # PANEL KANAN — Info voting
    # ==========================
    ax_info.set_facecolor('#f4faf0')
    ax_info.axis('off')

    y = 0.97
    ax_info.text(0.5, y, 'Hasil Voting', ha='center', va='top',
                fontsize=11, fontweight='bold', color='#1a5c2a',
                transform=ax_info.transAxes)
    y -= 0.06

    # Per user
    for user in USERS:
        label = frame['vote_map'].get(user, '-')
        color = COLORS.get(label, '#888')
        display = USER_DISPLAY[user]

        ax_info.text(0.05, y, display, ha='left', va='top',
                    fontsize=9, color='#333', transform=ax_info.transAxes)
        ax_info.text(0.95, y, label if label != '-' else '—', ha='right', va='top',
                    fontsize=9, fontweight='bold', color=color,
                    transform=ax_info.transAxes)
        y -= 0.055

    y -= 0.02
    ax_info.axhline(y=y + 0.01, color='#c8ddb8', linewidth=0.8,
                   xmin=0.05, xmax=0.95)
    y -= 0.04

    # Persentase
    total = frame['total']
    pruning_pct = (frame['pruning_count'] / total * 100) if total > 0 else 0
    underpruning_pct = (frame['underpruning_count'] / total * 100) if total > 0 else 0

    ax_info.text(0.5, y, 'Persentase', ha='center', va='top',
                fontsize=10, fontweight='bold', color='#1a5c2a',
                transform=ax_info.transAxes)
    y -= 0.06

    # Bar pruning
    ax_info.text(0.05, y, 'Pruning', ha='left', va='top',
                fontsize=9, color='#27500A', transform=ax_info.transAxes)
    ax_info.text(0.95, y, f'{pruning_pct:.0f}%', ha='right', va='top',
                fontsize=9, fontweight='bold', color='#3B6D11',
                transform=ax_info.transAxes)
    y -= 0.04

    bar_x = 0.05
    bar_w = 0.9
    bar_h = 0.03
    # Background bar
    ax_info.add_patch(FancyBboxPatch((bar_x, y - bar_h), bar_w, bar_h,
                                     boxstyle="round,pad=0.005",
                                     facecolor='#d4e8c2', edgecolor='none',
                                     transform=ax_info.transAxes))
    # Fill bar
    if pruning_pct > 0:
        ax_info.add_patch(FancyBboxPatch((bar_x, y - bar_h), bar_w * pruning_pct / 100, bar_h,
                                         boxstyle="round,pad=0.005",
                                         facecolor='#3B6D11', edgecolor='none',
                                         transform=ax_info.transAxes))
    y -= 0.07

    # Bar underpruning
    ax_info.text(0.05, y, 'Underpruning', ha='left', va='top',
                fontsize=9, color='#712B13', transform=ax_info.transAxes)
    ax_info.text(0.95, y, f'{underpruning_pct:.0f}%', ha='right', va='top',
                fontsize=9, fontweight='bold', color='#993C1D',
                transform=ax_info.transAxes)
    y -= 0.04

    ax_info.add_patch(FancyBboxPatch((bar_x, y - bar_h), bar_w, bar_h,
                                     boxstyle="round,pad=0.005",
                                     facecolor='#f5c4b3', edgecolor='none',
                                     transform=ax_info.transAxes))
    if underpruning_pct > 0:
        ax_info.add_patch(FancyBboxPatch((bar_x, y - bar_h), bar_w * underpruning_pct / 100, bar_h,
                                         boxstyle="round,pad=0.005",
                                         facecolor='#993C1D', edgecolor='none',
                                         transform=ax_info.transAxes))
    y -= 0.08

    # Majority vote
    majority = frame['majority']
    majority_color = COLORS.get(majority, '#888')
    ax_info.text(0.5, y, 'Majority Vote', ha='center', va='top',
                fontsize=10, fontweight='bold', color='#1a5c2a',
                transform=ax_info.transAxes)
    y -= 0.07
    ax_info.text(0.5, y, majority.upper() if majority != '-' else '—',
                ha='center', va='top', fontsize=14, fontweight='bold',
                color=majority_color, transform=ax_info.transAxes)

    # Navigasi hint
    ax_info.text(0.5, 0.02, '← → untuk navigasi', ha='center', va='bottom',
                fontsize=8, color='#aaa', transform=ax_info.transAxes)

    fig.patch.set_facecolor('#f2f5ee')
    plt.tight_layout()
    fig.canvas.draw()

# ==========================
# MAIN
# ==========================
def main():
    frames = load_data()
    if not frames:
        print("❌ Tidak ada data.")
        return

    state = {'index': 0}

    fig = plt.figure(figsize=(14, 7))
    fig.canvas.manager.set_window_title('Palm Oil Label Viewer')

    def on_key(event):
        if event.key == 'right':
            state['index'] = min(state['index'] + 1, len(frames) - 1)
        elif event.key == 'left':
            state['index'] = max(state['index'] - 1, 0)
        else:
            return
        draw_frame(fig, frames[state['index']], state['index'], len(frames))

    fig.canvas.mpl_connect('key_press_event', on_key)
    draw_frame(fig, frames[0], 0, len(frames))
    plt.show()

if __name__ == '__main__':
    main()
