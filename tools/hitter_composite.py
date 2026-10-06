#!/usr/bin/env python3
"""Hitting composite (Vicky+ for position players): 100 = PA-weighted league average, 20 points = 1 SD.

Same method as the pitching Vicky+:
  1. Inputs are process / skill stats (K%, BB%, EV, HardHit%, contact and swing rates ...). Outcome stats
     (wOBA, wRC+, wRAA, Bat, AVG/OBP/SLG ...) are never inputs, so the composite is not just a restated target.
  2. Every input is z-scored within its own season, then sign-aligned (K% -> negative, EV -> positive ...) from its
     correlation with next year's targets. No input is hand-signed.
  3. Weights = non-negative ridge regression of NEXT-YEAR targets on this year's aligned z-scores. Noisy stats get
     small weights automatically; inputs below --min-rel year-to-year reliability are dropped first.
  4. Weights are scored out of sample (leave-one-season-transition-out), against persistence and simple baselines.
  5. Composite z is re-standardised (SD 1 among --ref-pa+ PA seasons), recentred on the PA-weighted mean, and put on
     100 + 20 * z. A shrinkage projection (x = z * PA / (PA + K)) is fit for next year.

Targets (per-600-PA versions of the counting stats, so playing time is not what you are predicting):
  wRAA, wRC+, Bat (batting runs), Barrel%  -- weights set with --target-weights (default: Barrel% counts half).
  wRAA is used from the export if the column exists; otherwise it is estimated per season from wOBA and Bat.

Usage:
  python hitter_composite.py hitters_split_teams.csv --out-dir out
  python hitter_composite.py export.csv --seasons 2023-2026 --target-weights "wRAA=1,wRC+=1,Bat=1,Barrel%=0"
  python hitter_composite.py export.csv --exclude "Pull%,Cent%,Oppo%" --name "Hit+"
Needs: pandas, numpy, scipy.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd
from scipy.optimize import nnls

SUM_COLS = {'G','PA','AB','H','1B','2B','3B','HR','R','RBI','BB','SO','HBP','SF','SB','CS','Barrels','HardHit','Events','CompSw',
            'Bat','Off','Def','WAR','BsR','Fld','Rep','RAR','Pos','Lg','wRAA','wRC','wSB','UBR'}
ID_COLS = {'pid','Season','Name','NameASCII','Team','PlayerId','MLBAMID','Age','Age Rng','Bats','Lg','Pos'}
# Outcome / value stats: never used as inputs.
OUTCOME = {'wOBA','wRC+','wRAA','wRC','Bat','Off','Def','WAR','RAR','Rep','Fld','Pos','BsR','AVG','OBP','SLG','OPS','ISO','BABIP',
           'H','1B','2B','3B','R','RBI','HR','SB','G','PA','AB','CS','Lg','Dol','WPA','RE24','Clutch'}
EXPECTED = {'xwOBA','xBA','xSLG','xOBP'}
COUNTS = {'Barrels','HardHit','Events','CompSw','BB','SO','HBP','SF'}
BARREL_FAMILY = {'Barrel%','Barrels'}
TARGETS = ['wRAA','wRC+','Bat','Barrel%']

def log(*a): print(*a, flush=True)

# ---------------------------------------------------------------- loading
def load(path, seasons):
    d = pd.read_csv(path, encoding='utf-8-sig', low_memory=False)
    d = d.loc[:, ~d.columns.str.contains(r'\.\d+$')]                        # pandas renames repeated headers to X.1
    d = d.loc[:, ~d.columns.duplicated()]
    for c in d.columns:
        if c not in ('Name','NameASCII','Team','Age Rng','Bats'):
            d[c] = pd.to_numeric(d[c], errors='coerce')
    d = d[d['PA'] > 0]
    if seasons: d = d[(d.Season >= seasons[0]) & (d.Season <= seasons[1])]
    key = 'PlayerId' if 'PlayerId' in d.columns else ('MLBAMID' if 'MLBAMID' in d.columns else 'Name')
    d = d.rename(columns={key: 'pid'}) if key != 'pid' else d
    return aggregate(d)

def aggregate(d):
    """One row per player-season: counts are summed, rates are PA-weighted means (traded players have several rows)."""
    if not d.duplicated(['Season','pid']).any(): return d.reset_index(drop=True)
    num = [c for c in d.columns if c not in ('Season','pid','Name','NameASCII','Team','Age Rng','Bats') and pd.api.types.is_numeric_dtype(d[c])]
    out = []
    for (s, p), g in d.groupby(['Season','pid'], sort=False):
        if len(g) == 1: out.append(g.iloc[0]); continue
        r = g.iloc[g['PA'].values.argmax()].copy()
        w = g['PA'].values
        for c in num:
            v = g[c].values; ok = ~np.isnan(v)
            r[c] = np.nan if not ok.any() else (v[ok].sum() if c in SUM_COLS else np.average(v[ok], weights=w[ok] if w[ok].sum() > 0 else None))
        r['Team'] = '- - -'
        out.append(r)
    return pd.DataFrame(out).reset_index(drop=True)

def build_targets(d, tw):
    d = d.copy()
    if 'wRAA' not in d.columns and tw.get('wRAA', 0) > 0:
        if not {'Bat','wOBA'} <= set(d.columns): sys.exit('Need wRAA, or Bat and wOBA to estimate it.')
        d['wRAA'] = np.nan
        for s, g in d.groupby('Season'):
            g = g.dropna(subset=['Bat','wOBA'])
            A = np.column_stack([g.PA, g.PA * g.wOBA]); a, b = np.linalg.lstsq(A, g.Bat, rcond=None)[0]
            lg, scale = -a / b, 1 / b
            d.loc[d.Season == s, 'wRAA'] = d.PA * (d.wOBA - lg) / scale
            log(f'  wRAA estimated {int(s)}: lg wOBA {lg:.3f}, wOBA scale {scale:.2f}')
    for c in ('wRAA','Bat'):
        if c in d.columns: d[c + '600'] = d[c] / d.PA * 600
    return d

TCOL = {'wRAA':'wRAA600','wRC+':'wRC+','Bat':'Bat600','Barrel%':'Barrel%'}

# ---------------------------------------------------------------- statistics helpers
def wcorr(x, y, w=None):
    m = ~(np.isnan(x) | np.isnan(y)); x, y = x[m], y[m]; w = np.ones(len(x)) if w is None else w[m]
    if len(x) < 5: return np.nan
    mx, my = np.average(x, weights=w), np.average(y, weights=w)
    c = np.average((x - mx) * (y - my), weights=w)
    return c / np.sqrt(np.average((x - mx) ** 2, weights=w) * np.average((y - my) ** 2, weights=w))

def season_z(d, cols, ref_pa):
    """z-score each column within its season, using only seasons with >= ref_pa PA as the reference group."""
    Z = pd.DataFrame(index=d.index, columns=cols, dtype=float)
    for s, idx in d.groupby('Season').groups.items():
        ref = d.loc[idx][d.loc[idx, 'PA'] >= ref_pa]
        for c in cols:
            mu, sd = ref[c].mean(), ref[c].std()
            Z.loc[idx, c] = (d.loc[idx, c] - mu) / sd if sd and sd > 0 else 0.0
    return Z.clip(-4, 4)

def make_pairs(d, min_pa):
    a = d.copy(); b = d.copy(); b['Season'] = b['Season'] - 1
    m = a.reset_index().merge(b.reset_index(), on=['pid','Season'], suffixes=('','_n'))
    return m[(m.PA >= min_pa) & (m.PA_n >= min_pa)]

# ---------------------------------------------------------------- fitting
def fit_nnls(X, y, w, lam):
    sw = np.sqrt(w / w.mean())
    A = X * sw[:, None]; b = y * sw
    if lam > 0:
        A = np.vstack([A, np.sqrt(lam * len(y)) * np.eye(X.shape[1])]); b = np.concatenate([b, np.zeros(X.shape[1])])
    return nnls(A, b)[0]

def cv_fit(X, y, w, trans, lams):
    """Pick ridge strength by leave-one-transition-out correlation; return (lam, mean out-of-sample r)."""
    best = (None, -9)
    for lam in lams:
        rs = []
        for t in np.unique(trans):
            tr, te = trans != t, trans == t
            wt = fit_nnls(X[tr], y[tr], w[tr], lam)
            rs.append(wcorr(X[te] @ wt, y[te], w[te]))
        r = np.nanmean(rs)
        if r > best[1]: best = (lam, r)
    return best

def sign_align(P, feats, tz_next):
    sgn = {}
    for f in feats:
        r = wcorr(P['z_' + f].values, tz_next.values)
        sgn[f] = 1.0 if (r if not np.isnan(r) else 0) >= 0 else -1.0
    return sgn

# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv'); ap.add_argument('--out-dir', default='hitter_composite_out')
    ap.add_argument('--seasons', help='e.g. 2023-2026 (bat-tracking stats only exist from 2023)')
    ap.add_argument('--target-weights', default='wRAA=1,wRC+=1,Bat=1,Barrel%=0.5')
    ap.add_argument('--min-pa', type=float, default=150, help='PA needed in BOTH years for a pair (default 150)')
    ap.add_argument('--ref-pa', type=float, default=100, help='PA needed to count in a season mean/SD (default 100)')
    ap.add_argument('--min-rel', type=float, default=0.25, help='drop inputs with year-to-year r below this')
    ap.add_argument('--min-coverage', type=float, default=0.85)
    ap.add_argument('--include-expected', action='store_true', help='allow xwOBA/xBA/xSLG as inputs (off by default)')
    ap.add_argument('--keep-barrel-input', action='store_true', help='allow Barrel% as an input even when it is a target')
    ap.add_argument('--exclude', default='', help='comma list of columns never to use as inputs')
    ap.add_argument('--include', default='', help='comma list to force-allow (e.g. Def,BsR)')
    ap.add_argument('--name', default='Vicky+ Hit')
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    seasons = tuple(int(x) for x in a.seasons.split('-')) if a.seasons else None
    tw = {k.strip(): float(v) for k, v in (kv.split('=') for kv in a.target_weights.split(','))}
    tw = {k: v for k, v in tw.items() if v > 0}

    log(f'Loading {a.csv}')
    d = build_targets(load(a.csv, seasons), tw)
    log(f'  {len(d)} player-seasons, seasons {int(d.Season.min())}-{int(d.Season.max())}')
    tcols = {t: TCOL[t] for t in tw}
    for t, c in tcols.items():
        if c not in d.columns: sys.exit(f'Target {t} needs column {c} in the export.')

    # ---- candidate inputs
    banned = set(OUTCOME) | ID_COLS | COUNTS | set(tcols.values()) | {c + '600' for c in ('wRAA','Bat')}
    if not a.include_expected: banned |= EXPECTED
    if 'Barrel%' in tw and not a.keep_barrel_input: banned |= BARREL_FAMILY
    banned |= {x.strip() for x in a.exclude.split(',') if x.strip()}
    banned -= {x.strip() for x in a.include.split(',') if x.strip()}
    ref_rows = d[d.PA >= a.ref_pa]
    cands, dropped = [], []
    for c in d.columns:
        if c in banned or not pd.api.types.is_numeric_dtype(d[c]): continue
        cov = ref_rows[c].notna().mean()
        if cov < a.min_coverage: dropped.append((c, f'coverage {cov:.0%}')); continue
        if ref_rows[c].std() == 0: continue
        cands.append(c)
    log(f'  {len(cands)} candidate inputs (outcome stats, counts, targets and IDs excluded)')
    if dropped: log('  dropped for coverage: ' + ', '.join(f'{c} ({why})' for c, why in dropped[:20]))

    # ---- z-scores, pairs, targets
    allz = list(dict.fromkeys(cands + list(tcols.values())))
    Z = season_z(d, allz, a.ref_pa)
    for c in allz: d['z_' + c] = Z[c]
    P = make_pairs(d, a.min_pa)
    P = P.dropna(subset=['z_' + c + '_n' for c in tcols.values()]).reset_index(drop=True)   # next-year targets must exist
    log(f'  {len(P)} year-to-year pairs (>= {a.min_pa:.0f} PA both years), {P.Season.nunique()} transitions')
    # combined next-year target: weighted mean of the target z-scores (all measured the NEXT season)
    tzn = {t: P['z_' + c + '_n'] for t, c in tcols.items()}
    wsum = sum(tw.values())
    comb_next = sum(tw[t] * tzn[t] for t in tw) / wsum
    pw = np.minimum(P.PA, P.PA_n).astype(float).values            # pair weight: the smaller sample

    # ---- reliability (year-to-year) and sign alignment
    rel, pred = {}, {}
    sgn = sign_align(P, cands, comb_next)
    for f in cands:
        x = sgn[f] * P['z_' + f].values
        rel[f] = wcorr(P['z_' + f].values, P['z_' + f + '_n'].values, pw)
        pred[f] = {t: wcorr(x, tzn[t].values, pw) for t in tw}
    keep = [f for f in cands if rel[f] >= a.min_rel]
    for f in cands:
        if f not in keep: dropped.append((f, f'year-to-year r {rel[f]:.2f}'))
    log(f'  {len(keep)} inputs pass the stability screen (r >= {a.min_rel})')

    X = np.nan_to_num(np.column_stack([sgn[f] * P['z_' + f].values for f in keep]))   # missing input -> league average (0)
    trans = P.Season.values
    lams = [0, 0.001, 0.01, 0.05, 0.2]

    # ---- weights per target (the "does a volatile target find something different" table) and combined
    models = {}
    for t in list(tw) + ['COMBINED']:
        y = (comb_next if t == 'COMBINED' else tzn[t]).values
        if t == 'Barrel%' and not a.keep_barrel_input:
            idx = [i for i, f in enumerate(keep) if f not in BARREL_FAMILY]
        else: idx = list(range(len(keep)))
        lam, cvr = cv_fit(X[:, idx], y, pw, trans, lams)
        w = np.zeros(len(keep)); w[idx] = fit_nnls(X[:, idx], y, pw, lam)
        models[t] = {'w': w, 'lam': lam, 'cv_r': cvr}
    W = pd.DataFrame({t: m['w'] / (m['w'].sum() or 1) for t, m in models.items()}, index=keep)
    W['sign'] = [sgn[f] for f in keep]; W['yty_r'] = [rel[f] for f in keep]
    for t in tw: W['pred_' + t] = [pred[f][t] for f in keep]
    W = W.sort_values('COMBINED', ascending=False)
    W.round(4).to_csv(os.path.join(a.out_dir, 'weights.csv'))
    show = W[W['COMBINED'] > 0.001]
    log('\nWeights (share of total, sign-aligned; sign -1 means lower raw value is better)')
    log(show[list(tw) + ['COMBINED','sign','yty_r']].round(3).to_string())
    log('\nInputs given zero weight by every model: ' + ', '.join(W.index[(W[list(tw) + ['COMBINED']].sum(axis=1) < 1e-9)][:25]))

    # ---- out-of-sample evaluation of the combined composite
    wc = models['COMBINED']['w']; comp = X @ wc
    lam = models['COMBINED']['lam']
    oos = np.zeros(len(P))
    for t in np.unique(trans):
        tr, te = trans != t, trans == t
        oos[te] = X[te] @ fit_nnls(X[tr], comb_next.values[tr], pw[tr], lam)
    rows = []
    for t in list(tw):
        row = {'next-year target': t, 'composite (out-of-sample)': wcorr(oos, tzn[t].values, pw)}
        cur = 'z_' + tcols[t]
        row['same stat this year (persistence)'] = wcorr(P[cur].values, tzn[t].values, pw)
        if 'z_xwOBA' in P: row['xwOBA this year'] = wcorr(P['z_xwOBA'].values, tzn[t].values, pw)
        for b in ('K%','BB%'):
            if 'z_' + b in P: row[b + ' this year'] = wcorr((P['z_' + b] * (-1 if b == 'K%' else 1)).values, tzn[t].values, pw)
        rows.append(row)
    ev = pd.DataFrame(rows).set_index('next-year target')
    log('\nPredicting next year (weighted correlation, pairs with enough PA both years)')
    log(ev.round(3).to_string())
    log(f"\nCombined-target out-of-sample r: {models['COMBINED']['cv_r']:.3f}  (ridge {models['COMBINED']['lam']})")

    # ---- final composite on the 100 / 20 scale
    zfull = np.column_stack([sgn[f] * d['z_' + f].fillna(0).values for f in keep])
    c_all = zfull @ wc
    ref = (d.PA >= a.ref_pa).values
    sd = c_all[ref].std(); c_all = c_all / sd
    mu = np.average(c_all[ref], weights=d.PA.values[ref])
    d['Cz'] = c_all - mu; d['V'] = 100 + 20 * d['Cz']
    log(f"\n{a.name}: PA-weighted mean {np.average(d.V[ref], weights=d.PA[ref]):.1f}, SD {d.V[ref].std():.1f} (among {a.ref_pa:.0f}+ PA seasons)")

    # ---- projection: x = Cz * PA/(PA+K); PV = 100 + 20 * rho * x; targets projected from x
    m = d[['pid','Season','Cz','PA'] + list(tcols.values())].copy()
    nxt = d[['pid','Season','Cz'] + list(tcols.values())].copy(); nxt['Season'] -= 1
    J = m.merge(nxt, on=['pid','Season'], suffixes=('','_n')); n_pa = d[['pid','Season','PA']].copy(); n_pa['Season'] -= 1
    J = J.merge(n_pa.rename(columns={'PA':'PA_n'}), on=['pid','Season']); J = J[(J.PA >= a.min_pa) & (J.PA_n >= a.min_pa)]
    bestK, bestr = None, -9
    for K in (25, 50, 100, 150, 200, 300, 400, 600, 900):
        r = wcorr((J.Cz * J.PA / (J.PA + K)).values, J.Cz_n.values, np.minimum(J.PA, J.PA_n).values)
        if r > bestr: bestK, bestr = K, r
    xs = (J.Cz * J.PA / (J.PA + bestK)).values; jw = np.minimum(J.PA, J.PA_n).values
    def slope(y):
        mx, my = np.average(xs, weights=jw), np.average(y, weights=jw)
        return np.average((xs - mx) * (y - my), weights=jw) / np.average((xs - mx) ** 2, weights=jw), my
    rho = slope(J.Cz_n.values)[0]
    consts = {'name': a.name, 'K': bestK, 'rho': round(float(rho), 4), 'inputs': {f: round(float(w), 5) for f, w in zip(keep, wc / wc.sum())},
              'signs': {f: sgn[f] for f in keep}, 'targets': {}, 'target_weights': tw, 'reference_PA': a.ref_pa}
    for t, c in tcols.items():
        b, base = slope(J[c + '_n'].values); consts['targets'][t] = {'column': c, 'slope_per_x': round(float(b), 4), 'baseline': round(float(base), 4)}
    log(f"Projection: K = {bestK} PA, rho = {rho:.3f}, next-year r of shrunk composite = {bestr:.3f}")
    last = int(d.Season.max())
    pj = d[d.Season == last].copy(); pj['x'] = pj.Cz * pj.PA / (pj.PA + bestK); pj['ProjV'] = 100 + 20 * rho * pj.x
    for t, c in tcols.items(): pj['Proj ' + t] = consts['targets'][t]['baseline'] + consts['targets'][t]['slope_per_x'] * pj.x
    pcols = ['Name','Team','PA','V','ProjV'] + ['Proj ' + t for t in tcols]
    pj['V'] = pj['V'].round(1)
    pj[pcols].sort_values('ProjV', ascending=False).round(3).to_csv(os.path.join(a.out_dir, f'projections_{last + 1}.csv'), index=False)
    out = d[['Season','Name','Team','PA','V'] + [c for c in ('wRC+','wRAA','Bat','Barrel%','WAR') if c in d.columns]].copy()
    out['V'] = out['V'].round(1); out.sort_values(['Season','V'], ascending=[True, False]).to_csv(os.path.join(a.out_dir, 'composite.csv'), index=False)
    json.dump(consts, open(os.path.join(a.out_dir, 'constants.json'), 'w'), indent=1)
    log(f'\nWrote composite.csv, weights.csv, constants.json, projections_{last + 1}.csv to {a.out_dir}/')
    top = d[(d.Season == last) & (d.PA >= 200)].sort_values('V', ascending=False).head(10)
    top = top.assign(**{'Barrel%': top['Barrel%'] * 100}) if 'Barrel%' in top.columns else top
    log(f'\nTop {last} ({a.name}, 200+ PA):'); log(top[['Name','Team','PA','V'] + [c for c in ('wRC+','Barrel%') if c in d.columns]].round(1).to_string(index=False))

if __name__ == '__main__':
    main()
