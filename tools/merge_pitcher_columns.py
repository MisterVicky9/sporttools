"""Adds the columns found in a newer pitcher export to vickyplus-data.json without dropping existing ones.
Usage: python tools/merge_pitcher_columns.py new_export.json   (output of build_vickyplus_data.py)"""
import json, sys, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(root, 'vickyplus-data.json')
old = json.load(open(p)); new = json.load(open(sys.argv[1]))
oi = {c['name']: i for i, c in enumerate(old['columns'])}; ni = {c['name']: i for i, c in enumerate(new['columns'])}
add = [c for c in new['columns'] if c['name'] not in oi]
key = lambda cols, r: (r[cols['Season']], r[cols['PlayerId']], r[cols['Team']])
nrow = {key(ni, r): r for r in new['rows']}
for r in old['rows']:
    src = nrow.get(key(oi, r))
    r.extend([src[ni[c['name']]] if src else None for c in add])
old['columns'].extend(add)
json.dump(old, open(p, 'w'), separators=(',', ':'))
print('added', [c['name'] for c in add])
