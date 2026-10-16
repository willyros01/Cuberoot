#!/usr/bin/env python3
"""Daily public Firestore count aggregates -> ONE GitHub issue (no Gmail credentials)."""
from __future__ import annotations
import datetime as dt
import json, os, sys, urllib.request
from zoneinfo import ZoneInfo

PROJECT = 'split-it-44dea'
KEY = 'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78' # Public Firebase web API key
ROOT = f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents'
APPS = (('fidunio','FIDUNIO'),('scorecard','Scorecard'),('fairpot','Fairpot'),
        ('wire','Wire'),('spendrecorder','SpendRecorder'),('cloud-files','Cloud Files'))
TZ = ZoneInfo('America/Toronto')
ISSUE = 10
REPO = 'willyros01/Cuberoot'

def post(url, body, *, method='POST', token=''):
    headers={'Content-Type':'application/json','Accept':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request(url,json.dumps(body).encode(),headers,method=method)
    with urllib.request.urlopen(req,timeout=35) as r:return json.load(r)

def bounds(now=None):
    local=(now or dt.datetime.now(dt.timezone.utc)).astimezone(TZ)
    day=local.date()-dt.timedelta(days=1)
    start=dt.datetime.combine(day,dt.time.min,tzinfo=TZ).astimezone(dt.timezone.utc)
    end=dt.datetime.combine(local.date(),dt.time.min,tzinfo=TZ).astimezone(dt.timezone.utc)
    return day,start,end

def count(app,start=None,end=None):
    if app not in dict(APPS):raise ValueError('invalid app')
    filters=[]
    for op,t in (('GREATER_THAN_OR_EQUAL',start),('LESS_THAN',end)):
        if t:
            filters.append({'fieldFilter':{'field':{'fieldPath':'createdAt'},
                'op':op,'value':{'timestampValue':t.isoformat().replace('+00:00','Z')}}})
    q={'from':[{'collectionId':'events'}]}
    if filters:q['where']={'compositeFilter':{'op':'AND','filters':filters}} if len(filters)==2 else filters[0]
    url=f'{ROOT}/cuberoot_apk_clicks_v1/{app}:runAggregationQuery?key={KEY}'
    data=post(url,{'structuredAggregationQuery':{'structuredQuery':q,
                'aggregations':[{'alias':'clicks','count':{}}]}})
    if not isinstance(data,list) or len(data)!=1:raise ValueError('missing count '+app)
    v=data[0]['result']['aggregateFields']['clicks']['integerValue']
    if not isinstance(v,str) or not v.isdecimal():raise ValueError('invalid count '+app)
    return int(v)

def calculate(now=None):
    day,start,end=bounds(now)
    rows=[]
    for app,name in APPS:
        yesterday,total=count(app,start,end),count(app)
        if yesterday>total:raise ValueError('inconsistent '+app)
        rows.append((name,yesterday,total))
    day_total=sum(x[1] for x in rows)
    all_total=sum(x[2] for x in rows)
    body=['<!-- CUBEROOT_APK_DAILY:v1 -->',
          '# Cuberoot APK clicks — '+day.isoformat(),'',
          'Reporting date: **'+day.isoformat()+'**, Toronto local calendar day.','',
          '| App | Yesterday | Since tracking began |','|---|---:|---:|']
    body.extend(f'| {name} | {daily} | {lifetime} |' for name,daily,lifetime in rows)
    body += [f'| **ALL SIX** | **{day_total}** | **{all_total}** |','',
         'Recorded APK-link click attempts, not verified downloads or installations.',
         'Private event records are NOT included in this summary.',
         'Source: Firebase split-it-44dea.']
    return day.isoformat(),'\n'.join(body)+'\n'

def selftest():
    from unittest.mock import patch
    for now,hours in [('2026-03-09T15:00:00+00:00',23),('2026-11-02T15:00:00+00:00',25)]:
        _,s,e=bounds(dt.datetime.fromisoformat(now))
        assert (e-s).total_seconds()==hours*3600
    with patch(__name__+'.count',side_effect=[2,12]*6) as mock:
        date,body=calculate(dt.datetime.fromisoformat('2026-10-16T14:00:00+00:00'))
        assert date=='2026-10-15' and mock.call_count==12
        assert all(('| '+name+' | 2 | 12 |') in body for _,name in APPS)
        assert '**ALL SIX** | **12** | **72**' in body
    with patch(__name__+'.count',side_effect=[2,12]*5+[ValueError('403')]):
        try:calculate()
        except ValueError:pass
        else:raise AssertionError('Partial report was permitted')
    with patch(__name__+'.post',return_value=[]):
        try:count('fidunio')
        except ValueError:pass
        else:raise AssertionError('Missing Firestore result was permitted')
    print('PASS: six-app/DST/fail-closed tests')

def main():
    if '--self-test' in sys.argv:
        selftest()
        return
    day,body=calculate()
    token=os.environ.get('GITHUB_TOKEN','')
    if not token:raise ValueError('GitHub Actions issue token unavailable')
    result=post(f'https://api.github.com/repos/{REPO}/issues/{ISSUE}',
                {'body':body},method='PATCH',token=token)
    if result.get('number')!=ISSUE or result.get('body')!=body:
        raise ValueError('GitHub report confirmation mismatch')
    print('PASS: all six real counts published for '+day)

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('FAIL: NOT published; cannot verify all six counts. '+type(e).__name__+': '+str(e)[:140],file=sys.stderr)
        sys.exit(1)
