"""Builds pitcher-guts.csv (league values per season for the pitcher WAR editor)
from vickyplus-data.json, guts.csv and tools/league_stats.csv."""
import json, csv, collections, os
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
d = json.load(open(os.path.join(root, 'vickyplus-data.json')))
cols = [c['name'] for c in d['columns']]
R = [dict(zip(cols, r)) for r in d['rows']]
g = {int(float(r['Season'])): r for r in csv.DictReader(open(os.path.join(root, 'guts.csv'), encoding='utf-8-sig'))}
LG = {}
for r in csv.reader(open(os.path.join(here, 'league_stats.csv'), encoding='utf-8-sig')):
    pass
with open(os.path.join(here, 'league_stats.csv'), encoding='utf-8-sig') as f:
    rd = csv.reader(f); head = next(rd)
    for r in rd:
        first = {}
        for i, h in enumerate(head): first.setdefault(h, i)
        LG[int(float(r[0]))] = {h: float(r[i]) for h, i in first.items() if h != 'Season'}
AL = {'BAL','BOS','NYY','TBR','TOR','CHW','CLE','DET','KCR','MIN','HOU','LAA','OAK','ATH','SEA','TEX'}
n = lambda x: 0.0 if x is None else x
def tip(ip):
    w = int(ip + 1e-9); return w + round((ip - w) * 10) / 3
def iffb(r):
    # IFFB% is a share of fly balls, FB% a share of all batted balls (Events, home runs included)
    return n(r['IFFB%']) * n(r['FB%']) * r['Events']
by = collections.defaultdict(list)
for r in R:
    if r['IP'] and r['G']:
        r['I'] = tip(r['IP']); r['BBHBP'] = r['BB'] + r['HBP']
        r['IF'] = iffb(r); by[int(r['Season'])].append(r)
raw = lambda hr, bh, k, i_f, ip: (13 * hr + 3 * bh - 2 * (k + i_f)) / ip
rr = lambda rs: raw(sum(r['HR'] for r in rs), sum(r['BBHBP'] for r in rs), sum(r['SO'] for r in rs), sum(r['IF'] for r in rs), sum(r['I'] for r in rs))
out = []
for y, rs in sorted(by.items()):
    L = LG[y]; ip = tip(L['IP']); i_f = iffb(L)
    lgERA = L['ERA']; lgRA9 = float(g[y]['R/PA']) * L['TBF'] / ip * 9
    out.append([y, round(lgERA, 4), round(lgRA9, 4), round(raw(L['HR'], L['BB'] + L['HBP'], L['SO'], i_f, ip), 5),
                round(rr([r for r in rs if r['Team'] in AL]), 5), round(rr([r for r in rs if r['Team'] not in AL]), 5)])
with open(os.path.join(root, 'pitcher-guts.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['Season', 'lgERA', 'lgRA9', 'rawLG', 'rawAL', 'rawNL']); w.writerows(out)
