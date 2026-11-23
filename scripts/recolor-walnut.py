#!/usr/bin/env python3
"""From bordeaux to walnut brown (Pure, 2026-11-23 evening): cream with a brown that is "not fully brown, not fully
bordeaux, but brown in style", after the glazed "Mila Walnut" tiles Neslihan sent. The single bordeaux #7e3440 becomes
walnut #6f3a22 everywhere (site, Instagram page, start page, app, admin, 3D scenes); the website's third palette
"Bordeaux" becomes "Walnoot" (old ?studie=bordeaux links still open it); the palette texts in seven languages follow.
Real reds stay: error/status reds, skin markers in the dossier, the payment logo. Run from the repo root."""
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = []
for root, exts in (('site/website', ('.css', '.js', '.html')), ('site/instagram', ('.html',)), ('site', ('.html',)),
                   ('apps/admin/src', ('.ts', '.tsx', '.css')), ('apps/mobile/src', ('.ts', '.tsx')), ('packages/shared/src', ('.ts',))):
    base = ROOT / root
    it = base.glob('*') if root == 'site' else base.rglob('*')
    FILES += [p for p in it if p.is_file() and p.suffix in exts and 'node_modules' not in p.parts]
FILES = sorted(set(FILES))

def colours(s):
    s = re.sub(r'#7e3440\b', '#6f3a22', s)
    s = re.sub(r'#7E3440\b', '#6F3A22', s)
    s = re.sub(r'rgb\(126 52 64', 'rgb(111 58 34', s)
    s = re.sub(r'rgba\(126,\s*52,\s*64', lambda m: m.group(0).replace('126', '111').replace('52', '58').replace('64', '34'), s)
    return s

# The website's third palette: key, label and texts.
STUDY = [
    ("'creme', 'karamel', 'bordeaux'", "'creme', 'karamel', 'walnoot'"),
    ("bordeaux: 'c-up-hero'", "walnoot: 'c-up-hero'"),
    ("bordeaux: '#f6f1ea'", "walnoot: '#f6f1ea'"),
    ("[data-study='bordeaux']", "[data-study='walnoot']"),
    ('data-study="bordeaux"', 'data-study="walnoot"'),
    ('<span>III · Bordeaux</span>', '<span>III · Walnoot</span>'),
    ('studyBordeaux', 'studyWalnoot'),
    ("/* Bordeaux: a centred title over a softly darkened close-up, bordeaux bands. */", "/* Walnoot: a centred title over a softly darkened close-up, walnut-brown bands. */"),
    ("three palettes in light brown and bordeaux", "three palettes in cream and walnut brown"),
]
TEXT = [
    # i18n, palette notes
    ('met bordeaux als accent', 'met walnootbruin als accent'),
    ("Bordeaux op crème: bordeaux banden en knoppen", "Walnootbruin op crème: walnootbruine banden en knoppen"),
    ('with a bordeaux accent', 'with a walnut-brown accent'),
    ('Bordeaux on cream: bordeaux bands and buttons', 'Walnut brown on cream: walnut-brown bands and buttons'),
    ('con un acento burdeos', 'con un acento marrón nogal'),
    ('Burdeos sobre crema: franjas y botones burdeos', 'Marrón nogal sobre crema: franjas y botones marrón nogal'),
    ('avec une touche de bordeaux', 'avec une touche de brun noyer'),
    ('Bordeaux sur crème : bandeaux et boutons bordeaux', 'Brun noyer sur crème : bandeaux et boutons brun noyer'),
    ('mit Bordeaux als Akzent', 'mit Walnussbraun als Akzent'),
    ('Bordeaux auf Creme: Bänder und Knöpfe in Bordeaux', 'Walnussbraun auf Creme: Bänder und Knöpfe in Walnussbraun'),
    ('con un accento bordeaux', 'con un accento marrone noce'),
    ('Bordeaux su crema: fasce e pulsanti bordeaux', 'Marrone noce su crema: fasce e pulsanti marrone noce'),
    ('مع لمسة عنابية', 'مع لمسة بني جوزي'),
    ('عنابي على كريمي: أشرطة وأزرار عنابية', 'بني جوزي على كريمي: أشرطة وأزرار بلون بني جوزي'),
    # start page cards
    ('Drie kleurpaletten in licht bruin en bordeaux, crème, karamel en bordeaux,', 'Drie kleurpaletten in crème en walnootbruin: crème, karamel en walnoot,'),
    ('in bruin en bordeaux,', 'in crème en walnootbruin,'),
    ('Three colour palettes in light brown and bordeaux, cream, caramel and bordeaux,', 'Three colour palettes in cream and walnut brown: cream, caramel and walnut,'),
    ('in brown and bordeaux,', 'in cream and walnut brown,'),
    ('ثلاث لوحات ألوان بالبني الفاتح والعنابي: كريمي وكراميل وعنابي،', 'ثلاث لوحات ألوان بالكريمي والبني الجوزي: كريمي وكراميل وجوزي،'),
    ('بالبني والعنابي،', 'بالكريمي والبني الجوزي،'),
    ('Trois palettes en brun clair et bordeaux, crème, caramel et bordeaux,', 'Trois palettes en crème et brun noyer : crème, caramel et noyer,'),
    ('en brun et bordeaux,', 'en crème et brun noyer,'),
    ('Drei Farbpaletten in hellem Braun und Bordeaux, Creme, Karamell und Bordeaux,', 'Drei Farbpaletten in Creme und Walnussbraun: Creme, Karamell und Walnuss,'),
    ('in Braun und Bordeaux,', 'in Creme und Walnussbraun,'),
    ('Tre palette in marrone chiaro e bordeaux, crema, caramello e bordeaux,', 'Tre palette in crema e marrone noce: crema, caramello e noce,'),
    ('in marrone e bordeaux,', 'in crema e marrone noce,'),
    ('Tres paletas en marrón claro y burdeos, crema, caramelo y burdeos,', 'Tres paletas en crema y marrón nogal: crema, caramelo y nogal,'),
    ('en marrón y burdeos,', 'en crema y marrón nogal,'),
    # Instagram page
    ('rijen van drie posts die samen één beeld vormen, in bruin en bordeaux,', 'rijen van drie posts die samen één beeld vormen, in crème en walnootbruin,'),
    ('In licht bruin en bordeaux, met weinig tekst op het beeld.', 'In crème en walnootbruin, met weinig tekst op het beeld.'),
    ('Eén bordeaux fluwelen plank loopt door de drie posts.', 'Eén walnootbruine fluwelen plank loopt door de drie posts.'),
]

changed = []
for p in FILES:
    s = p.read_text()
    t = colours(s)
    if p.is_relative_to(ROOT / 'site'):
        for a, b in STUDY + TEXT:
            t = t.replace(a, b)
    if t != s:
        p.write_text(t)
        changed.append(str(p.relative_to(ROOT)))
print('\n'.join(changed))
print(len(changed), 'files')
