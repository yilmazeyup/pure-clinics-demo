#!/usr/bin/env python3
"""Moves the app, the admin and their 3D scenes to Pure's light brown and bordeaux: ivory, cream, linen, caramel,
mocha, a soft cocoa for text and bordeaux for buttons and accents, never powder pink (Pure, 2026-11-23). It maps the
blush tones of the previous round. One table, applied to every source file; skin and hair tones and the green/red status colours
are not in the table, so they stay as they are. Run from the repo root: python3 scripts/recolor-brown-bordeaux.py"""
import pathlib, re

HEX = {
    # grounds: from pearl and blush to ivory, cream and linen (no pink: Pure wants to stand apart from powder tones)
    'F6EFEA': 'F7F3EC', 'F9F3F0': 'FAF6F0', 'F4ECE8': 'F4EEE5', 'F4EBE7': 'F3EDE4', 'F2E8E4': 'F1EAE0',
    'FBF6F3': 'FCF9F4', 'FBF7F5': 'FCF9F5', 'F8F3F0': 'F9F5EF', 'F5EDE9': 'F5EFE7', 'F0E4DF': 'EFE7DC',
    'EFE1DB': 'EEE5D9', 'EEE0DA': 'ECE3D6', 'EADFDA': 'E9E1D6', 'ECDCD6': 'EAE0D3', 'E8DCD7': 'E8DFD3',
    'E6D3CC': 'E4D8C8', 'EEE3DE': 'EDE6DB', 'F1E1DD': 'F0E8DD', 'EAD5D1': 'E9DFD1', 'F6ECE8': 'F6EFE6',
    # lines and soft tones: from dusty rose to linen, sand and caramel
    'E8D8D2': 'E6DCCF', 'E6D2CC': 'E3D7C6', 'DBCDC8': 'DAD0C3', 'DCC6BF': 'D8C9B5', 'D9C0B6': 'D5C2A9',
    'CFB2AC': 'D6C2A8', 'CDB3AC': 'CDBBA4', 'C9AFA9': 'C8B49C', 'C3AAA4': 'BFAA92', 'B48F8E': 'B8977A',
    'D9BCB4': 'D6BE9E', '8E726A': '8C735F', '957370': '9A7B62',
    # the tone that carries white text: a real bordeaux
    '8A4B55': '7E3440',
    # text: a soft cocoa, not espresso-dark (clean, light look)
    '87706A': '908070', '5E4743': '67564A', '57423F': '5E4E43', '4B3532': '524236', '45302D': '4E3D32',
    '3E2C29': '46372D', '3A2724': '433429', '3A2623': '3F3128', '2B1B19': '3A2D25',
    # gold line: champagne
    'C8AD8A': 'C6A979',
}
RGB = {
    (58, 38, 35): (63, 49, 40), (48, 30, 28): (58, 45, 37), (44, 28, 26): (54, 42, 34), (58, 36, 34): (63, 49, 40),
    (40, 22, 20): (50, 38, 30), (44, 26, 24): (54, 42, 34), (252, 247, 245): (252, 249, 244), (250, 244, 241): (250, 247, 241),
    (241, 232, 228): (241, 235, 226),
}
FILES = ['packages/shared/src/brands.ts']
for root, exts in (('apps/mobile/src', ('.ts', '.tsx')), ('apps/admin/src', ('.ts', '.tsx', '.css'))):
    FILES += [str(p) for p in pathlib.Path(root).rglob('*') if p.suffix in exts]

def hexsub(m):
    v = m.group(1)
    new = HEX.get(v.upper())
    if not new: return m.group(0)
    return '#' + (new if v.isupper() or v.isdigit() else new.lower())

def rgbsub(m):
    key = tuple(int(x) for x in m.group(2).split(','))
    new = RGB.get(key)
    if not new: return m.group(0)
    return f"{m.group(1)}({new[0]}, {new[1]}, {new[2]}{m.group(3)}"

changed = 0
for f in FILES:
    p = pathlib.Path(f); s = p.read_text()
    t = re.sub(r'#([0-9A-Fa-f]{6})\b', hexsub, s)
    t = re.sub(r'(rgba?)\(\s*(\d+\s*,\s*\d+\s*,\s*\d+)(\s*[,)/])', lambda m: rgbsub(type('M', (), {'group': lambda self, i: (m.group(0), m.group(1), m.group(2).replace(' ', ''), m.group(3))[i]})()), t)
    if t != s:
        p.write_text(t); changed += 1
        print('recoloured', f)
print(changed, 'files')
