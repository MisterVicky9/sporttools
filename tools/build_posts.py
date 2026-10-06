#!/usr/bin/env python3
"""Scan posts/*/post.md and write posts/index.json + feed.xml.
Run from the site root:  python3 tools/build_posts.py"""
import json, re, sys, html, pathlib
from email.utils import format_datetime
from datetime import datetime, timezone
root = pathlib.Path(__file__).resolve().parent.parent
def parse(t):
    t = t.replace('\r', '')
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?(.*)$', t, re.S)
    meta, body = {}, t
    if m:
        body = m.group(2)
        for l in m.group(1).split('\n'):
            if ':' in l:
                k, v = l.split(':', 1)
                meta[k.strip().lower()] = v.strip().strip('"\'')
    return meta, body
posts = []
for f in sorted((root / 'posts').glob('*/post.md')):
    meta, body = parse(f.read_text(encoding='utf-8'))
    if meta.get('draft', '').lower() == 'true':
        continue
    slug = f.parent.name
    words = len(re.findall(r'\w+', re.sub(r'<[^>]+>|!\[[^\]]*\]\([^)]*\)', ' ', body)))
    e = {'slug': slug, 'title': meta.get('title', slug), 'date': meta.get('date', slug[:10]),
         'summary': meta.get('summary', ''), 'read': max(1, round(words / 220))}
    if meta.get('cover'): e['cover'] = meta['cover']
    posts.append(e)
posts.sort(key=lambda p: p['date'], reverse=True)
(root / 'posts' / 'index.json').write_text(json.dumps(posts, indent=1), encoding='utf-8')
items = ''.join('<item><title>%s</title><link>post.html?p=%s</link><pubDate>%s</pubDate><description>%s</description></item>' % (
    html.escape(p['title']), p['slug'],
    format_datetime(datetime.strptime(p['date'], '%Y-%m-%d').replace(tzinfo=timezone.utc)) if re.match(r'\d{4}-\d\d-\d\d$', p['date']) else '',
    html.escape(p['summary'])) for p in posts)
(root / 'feed.xml').write_text('<?xml version="1.0"?><rss version="2.0"><channel><title>Sports Stat Tools</title><link>index.html</link><description>Blog</description>%s</channel></rss>' % items, encoding='utf-8')
print('indexed %d posts' % len(posts))
