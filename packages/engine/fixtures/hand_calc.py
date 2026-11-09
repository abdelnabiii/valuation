"""Independent recalculation of the reference case (does not import the engine).
Run: python3 fixtures/hand_calc.py  -> prints JSON used by test/hand-example.test.ts
"""
import json, math

rev_A = 6_000_000 + 3_000_000 + 600_000 + 400_000
cost_A = 3_000_000 + 2_000_000 + 1_000_000 + 600_000 + 200_000 + 300_000 + 100_000 + 300_000
rev_B = 4_000_000 + 2_000_000
cost_B = 1_800_000 + 1_400_000 + 720_000 + 400_000 + 150_000 + 180_000 + 50_000 + 100_000
ho = 1_200_000
R0 = rev_A + rev_B
reported = R0 - cost_A - cost_B - ho
addbacks = 900_000 + 300_000
sde = reported + addbacks
norm = sde - 600_000
m0 = norm / R0

# Discount rate (USD build-up -> EGP via inflation differential)
ke_usd = 0.045 + 0.045 + 0.07 + 0.03 + 0.03
infl = [0.15, 0.12, 0.10, 0.09, 0.08]
pi_lt, pi_us = 0.07, 0.02
r = [(1 + ke_usd) * (1 + p) / (1 + pi_us) - 1 for p in infl]
r_lt = (1 + ke_usd) * (1 + pi_lt) / (1 + pi_us) - 1
w_usd = (1 + r_lt) * (1 + pi_us) / (1 + pi_lt) - 1

tax = 0.225
def forecast(sss, mdelta, units, mshift=0.0, rates=None, rlt=None, greal=0.01, capex_unit=4_000_000):
    rates = rates or r
    rlt = rlt if rlt is not None else r_lt
    idx = 1.0; ex = R0; prev = R0; C = 1.0; cum = 0; cums = [0]; out = []
    for t in range(1, 6):
        p = infl[t - 1]
        idx *= 1 + p
        ex = ex * (1 + sss) * (1 + p)
        n = units[t - 1]; cum += n; cums.append(cum)
        nprev = units[t - 2] if t >= 2 else 0
        mat = cums[t - 2] if t >= 3 else 0
        newrev = 10_000_000 * idx * (0.6 * n + 0.9 * nprev + mat)
        rev = ex + newrev
        margin = m0 + mshift + mdelta * t / 5
        e = rev * margin
        da = rev * 0.04
        tx = max(0.0, e - da) * tax
        exp = n * capex_unit * idx
        maint = rev * 0.03
        fcff = e - tx - exp - maint - 0 * (rev - prev)
        df = 1 / (C * math.sqrt(1 + rates[t - 1]))
        C *= 1 + rates[t - 1]
        out.append(dict(rev=rev, ebitda=e, tax=tx, capex=exp + maint, fcff=fcff, df=df, pv=fcff * df, maint=maint))
        prev = rev
    y5 = out[-1]
    g = (1 + greal) * (1 + pi_lt) - 1
    tfcff = (y5["ebitda"] - y5["tax"] - y5["maint"]) * (1 + g)
    tvg = tfcff / (rlt - g)
    tvx = y5["ebitda"] * 6
    dfe = 1 / C
    spv = sum(y["pv"] for y in out)
    ev = 0.5 * (spv + tvg * dfe) + 0.5 * (spv + tvx * dfe)
    return dict(years=out, sumPv=spv, tvGordon=tvg, tvExit=tvx, ev=ev, dfEnd=dfe)

base = forecast(0.02, 0.0, [1, 1, 0, 0, 0])
up = forecast(0.04, 0.02, [1, 2, 1, 0, 0])
down = forecast(-0.02, -0.03, [0, 0, 0, 0, 0])
dcf_w = 0.5 * base["ev"] + 0.25 * up["ev"] + 0.25 * down["ev"]

# Multiples (QUARTILE.INC on 5 points: Q1 = 2nd, median = 3rd, Q3 = 4th)
def q(v, p):
    s = sorted(v); pos = (len(s) - 1) * p; lo = math.floor(pos); hi = math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)
ebm = [5, 6, 7, 8, 10]; rvm = [0.8, 1.0, 1.2, 1.5, 2.0]; sdm = [2.5, 3, 3.5, 4, 4.5]
def rng(v, base_):
    return base_ * q(v, .25), base_ * q(v, .5), base_ * q(v, .75)
e = rng(ebm, norm); rv = rng(rvm, R0); sd = rng(sdm, sde)
mult = [0.6 * e[i] + 0.2 * rv[i] + 0.2 * sd[i] for i in range(3)]

# Asset floor
equip = 1_500_000 + 1_500_000; fit = 2_000_000 + 2_500_000; furn = 500_000
gross = equip * .35 + fit * .05 + furn * .15 + 500_000 * .5
floor = gross * (1 - .1)

net = -2_000_000 + 1_000_000 - 20_000 * 50 + 300_000
factor = (1 - .2) * (1 - .05) * (1 - .02) * (1 - .025) * (1 - .02)
lo = 0.5 * down["ev"] + 0.5 * mult[0]
mid = 0.5 * dcf_w + 0.5 * mult[1]
hi = 0.5 * up["ev"] + 0.5 * mult[2]
lo, mid, hi = (max(x, floor) for x in (lo, mid, hi))
adj = [(x + net) * factor for x in (lo, mid, hi)]
rounded = [round(x / 100_000) * 100_000 for x in adj]

print(json.dumps(dict(
    revenue=R0, reportedEbitda=reported, sde=sde, normalizedEbitda=norm, normalizedMargin=m0,
    keUsd=ke_usd, waccEgp=r, waccEgpTerminal=r_lt, waccUsd=w_usd,
    base=dict(fcff=[y["fcff"] for y in base["years"]], revenue=[y["rev"] for y in base["years"]],
              sumPv=base["sumPv"], tvGordon=base["tvGordon"], tvExit=base["tvExit"], ev=base["ev"]),
    upsideEv=up["ev"], downsideEv=down["ev"], dcfWeighted=dcf_w,
    multiples=dict(ebitda=e, revenue=rv, sde=sd, low=mult[0], mid=mult[1], high=mult[2]),
    assetFloor=floor, bridgeNet=net, adjFactor=factor,
    evLow=lo, evMid=mid, evHigh=hi, adjusted=adj, rounded=rounded,
), indent=2))
