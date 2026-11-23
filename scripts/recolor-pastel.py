#!/usr/bin/env python3
"""Moves the app, the admin and their 3D scenes from the old coffee neutrals to Pure's pastel brown and bordeaux
(chosen 2026-11-23). One table, applied to every source file; skin and hair tones and the green/red status colours
are not in the table, so they stay as they are. Run from the repo root: python3 scripts/recolor-pastel.py"""
import pathlib, re

HEX = {
    # backgrounds and surfaces: from oat and ivory to pearl and blush
    'F6F1EA': 'F6EFEA', 'F8F5F0': 'F9F3F0', 'F3EFE9': 'F4ECE8', 'F4F1EB': 'F4EBE7', 'F1ECE5': 'F2E8E4',
    'FBF8F3': 'FBF6F3', 'FAF8F4': 'FBF7F5', 'F7F4EF': 'F8F3F0', 'F4EEE6': 'F5EDE9', 'EFE7DC': 'F0E4DF',
    'EFE6DA': 'EFE1DB', 'ECE4D6': 'EEE0DA', 'E9E3DA': 'EADFDA', 'E9DED3': 'ECDCD6', 'E7E0D6': 'E8DCD7',
    'E4D6C8': 'E6D3CC', 'EDE6DC': 'EEE3DE', 'F1E6DF': 'F1E1DD', 'EBDDD5': 'EAD5D1', 'F1E9DF': 'F6ECE8',
    # lines and soft tones: from sand and stone to dusty rose
    'E2D8CC': 'E8D8D2', 'E2D6C6': 'E6D2CC', 'D9D2C8': 'DBCDC8', 'D8CCBE': 'DCC6BF', 'DCC9B3': 'D9C0B6',
    'CBBEAA': 'CFB2AC', 'C9BCAE': 'CDB3AC', 'C9B8AE': 'C9AFA9', 'BFB3A5': 'C3AAA4', 'B29C82': 'B48F8E',
    'D9C4A6': 'D9BCB4', '94826E': '8E726A', '8C7B6B': '957370',
    # the darker tone that carries white text becomes bordeaux
    '7A6A55': '8A4B55',
    # text and ink: from charcoal and coffee to cocoa
    '6E6259': '87706A', '655A51': '5E4743', '57504A': '57423F', '4E463F': '5E4743', '4A433D': '4B3532',
    '3A3530': '45302D', '3A3833': '3E2C29', '2E2A26': '3A2724', '2A2926': '3A2623', '1E1E1C': '3A2623',
    '141210': '2B1B19', '141414': '2B1B19', '15130F': '2B1B19',
    # gold line under the wordmark: champagne
    'B99A62': 'C8AD8A',
}
RGB = {
    (30, 30, 28): (58, 38, 35), (28, 27, 25): (48, 30, 28), (24, 23, 21): (44, 28, 26), (40, 32, 24): (58, 36, 34),
    (20, 16, 12): (40, 22, 20), (24, 20, 16): (44, 26, 24), (252, 249, 244): (252, 247, 245), (250, 246, 240): (250, 244, 241),
    (239, 234, 226): (241, 232, 228),
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
