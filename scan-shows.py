"""
scan-shows.py - Automatische Erkennung und Synchronisierung von Hörspiel-Ordnern
Durchsucht alle Unterordner nach metadata.md und aktualisiert shows.json.
"""

import os
import json
import re

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
IGNORE_DIRS = {'.git', 'assets', '__pycache__', 'node_modules', '.vscode'}

def parse_metadata(meta_path):
    info = {'title': '', 'short': '', 'long': '', 'status': 'active'}
    if not os.path.exists(meta_path):
        return info
    
    with open(meta_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Check for title
    t_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    if t_match:
        info['title'] = t_match.group(1).strip()
    
    # Check for Kurzbeschreibung
    short_match = re.search(r'##\s*Kurzbeschreibung\s*\n+([^\n#]+)', content, re.IGNORECASE)
    if short_match:
        info['short'] = short_match.group(1).strip()
        
    return info

def find_cover(folder_path):
    for ext in ['.jpg', '.jpeg', '.png', '.webp', '.svg']:
        candidate = os.path.join(folder_path, f'cover{ext}')
        if os.path.exists(candidate):
            return f'cover{ext}'
    return None

def main():
    shows = []
    preferred_order = ['ddf', 'hp', 'tkkg', 'alf']

    
    # Load existing shows to preserve badges or custom ordering
    existing_map = {}
    shows_json_path = os.path.join(ROOT_DIR, 'shows.json')
    if os.path.exists(shows_json_path):
        try:
            with open(shows_json_path, 'r', encoding='utf-8') as f:
                for s in json.load(f):
                    existing_map[s.get('id', s.get('path'))] = s
        except Exception as e:
            print("Konnte existierende shows.json nicht laden:", e)

    candidates = [item for item in os.listdir(ROOT_DIR) if os.path.isdir(os.path.join(ROOT_DIR, item)) and item not in IGNORE_DIRS and not item.startswith('.')]
    candidates.sort(key=lambda x: preferred_order.index(x) if x in preferred_order else 999)

    for item in candidates:
        item_path = os.path.join(ROOT_DIR, item)
        if not os.path.isdir(item_path) or item in IGNORE_DIRS or item.startswith('.'):
            continue
        
        meta_path = os.path.join(item_path, 'metadata.md')
        if not os.path.exists(meta_path):
            continue
        
        meta = parse_metadata(meta_path)
        existing = existing_map.get(item, {})
        
        status = existing.get('status', 'coming_soon' if item == 'tkkg' else 'active')
        badge = existing.get('badge', 'Serie' if status == 'active' else 'Bald verfügbar')
        cover_file = find_cover(item_path)
        
        shows.append({
            'id': item,
            'path': item,
            'title': meta.get('title') or existing.get('title') or item.upper(),
            'status': status,
            'badge': badge,
            'cover': f"{item}/{cover_file}" if cover_file else f"{item}/cover.jpg"
        })

    with open(shows_json_path, 'w', encoding='utf-8') as f:
        json.dump(shows, f, ensure_ascii=False, indent=2)

    print(f"Erfolgreich {len(shows)} Serien in shows.json aktualisiert: {[s['id'] for s in shows]}")

if __name__ == '__main__':
    main()
