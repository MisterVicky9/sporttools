"""Builds positions.json (games at each fielding position per player-season; 1 game = 9 innings) from tools/defense.csv."""
import csv, json, os, collections
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
def tip(x):
    x = float(x); w = int(x + 1e-9); return w + round((x - w) * 10) / 3
out = collections.defaultdict(dict)
for r in csv.DictReader(open(os.path.join(here, 'defense.csv'), encoding='utf-8-sig')):
    if r['Pos'] in POS and r['Inn']:
        k = r['PlayerId'] + '|' + str(int(float(r['Season'])))
        out[k][r['Pos']] = round(out[k].get(r['Pos'], 0) + tip(r['Inn']) / 9, 1)
json.dump(out, open(os.path.join(root, 'positions.json'), 'w'), separators=(',', ':'))
print(len(out))
