"""Independent hand calculations for the operating, real-estate and startup profiles."""
import json
infl=[0.15,0.12,0.10,0.09,0.08]
# Operating: nominal plan 20%,15%,12%,10%,8% -> real
plan=[0.20,0.15,0.12,0.10,0.08]
real=[(1+n)/(1+p)-1 for n,p in zip(plan,infl)]
R0=16_000_000
rev=[]; r=R0
for g,p in zip(real,infl):
    r=r*(1+g)*(1+p); rev.append(r)
# Real estate
nav=30_000_000+20_000_000
noi=3_100_000
ic=dict(low=noi/0.11, mid=noi/0.10, high=noi/0.09)
# Startup
def vc(m): return 100_000_000*m*0.7/1.4**5
vcr=dict(low=vc(1.0), mid=vc(1.2), high=vc(1.5))
score=10_000_000*(1+0.3*0.25)
roundv=12_000_000*(1-0.1)
eq_mid=0.4*vcr['mid']+0.3*score+0.3*roundv
eq_low=0.4*vcr['low']+0.3*score+0.3*roundv
eq_high=0.4*vcr['high']+0.3*score+0.3*roundv
print(json.dumps(dict(real=real, rev=rev, nav=nav, ic=ic, vc=vcr, score=score, round=roundv, startupEquity=[eq_low,eq_mid,eq_high]), indent=1))
