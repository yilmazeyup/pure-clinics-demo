#!/usr/bin/env python3
"""Writes site/website/team/<id>/index.html for every team member from scripts/team-page.html.tpl."""
import os, re
tpl = open('scripts/team-page.html.tpl').read()
src = open('site/website/js/team-data.js').read()
for pid, name in re.findall(r"id: '([a-z]+)', name: '([^']+)'", src):
    os.makedirs(f'site/website/team/{pid}', exist_ok=True)
    open(f'site/website/team/{pid}/index.html', 'w').write(tpl.replace('{name}', name).replace('{id}', pid))
    print('wrote', pid)
