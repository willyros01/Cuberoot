#!/usr/bin/env python3
"""Run in the owner's authenticated Cloud Shell; extend only the click allowlist.

Does not send email, create click records or change application/household rules.
Prototype candidate rules are checked by the Firebase Rules API before release.
"""
import copy
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

PROJECT = 'split-it-44dea'
KEY = 'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78'  # Existing public web key.
OLD = {'fidunio','scorecard','fairpot','wire','spendrecorder','cloud-files','marker'}
NEW = ('ate-windows','ate-mac','ate')
RULES = 'https://firebaserules.googleapis.com/v1/'
RELEASE = 'projects/'+PROJECT+'/releases/cloud.firestore'


def extend(source):
    """Return the same files with one literal insertion in allowedApp()."""
    candidate=copy.deepcopy(source)
    files=candidate.get('files',[])
    matches=[f for f in files if f.get('name')=='firestore.rules']
    if len(matches)!=1: raise ValueError('Expected exactly one firestore.rules file')
    file=matches[0]; text=file['content']
    pattern=r'(function\s+allowedApp\s*\(\s*\)\s*\{\s*return\s+[A-Za-z_]\w*\s+in\s*\[)([^\]]*)(\]\s*;\s*\})'
    found=list(re.finditer(pattern,text))
    if len(found)!=1: raise ValueError('Allowlist shape differs; nothing will be deployed')
    match=found[0]; body=match[2]
    if 'cuberoot_apk_clicks_v1' not in text[max(0,match.start()-500):match.start()]:
        raise ValueError('Allowlist is not next to the download-counter match')
    token=r"(['\"])([a-z-]+)\1"
    values=[m[2] for m in re.finditer(token,body)]
    if re.sub(token,'',body).strip(' \t\r\n,') or len(values)!=len(set(values)):
        raise ValueError('Allowlist must contain unique literal category names')
    if set(values)==OLD|set(NEW): return candidate,False
    if set(values)!=OLD: raise ValueError('Live categories differ; refusing to overwrite them')
    insertion=('' if body.rstrip().endswith(',') else ',')+' '+', '.join(repr(x) for x in NEW)
    offset=match.end(2)
    file['content']=text[:offset]+insertion+text[offset:]
    if file['content'][:offset]+file['content'][offset+len(insertion):]!=text:
        raise ValueError('Unrelated rules changed')
    for original,updated in zip(source['files'],candidate['files']):
        if original.get('name')!='firestore.rules' and original!=updated:
            raise ValueError('Unrelated source file changed')
    return candidate,True


def request(url,body=None,token='',method=None):
    headers={'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache'}
    if token: headers['Authorization']='Bearer '+token
    req=urllib.request.Request(url,None if body is None else json.dumps(body).encode(),headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=40) as response:return json.load(response)
    except urllib.error.HTTPError as error:
        # Never include headers, credentials or response bodies in diagnostics.
        raise RuntimeError('Google API HTTP '+str(error.code)+'; no credentials logged') from None


def public_counts():
    zone=ZoneInfo('America/Toronto'); today=dt.datetime.now(zone).date()
    start=dt.datetime.combine(today,dt.time.min,tzinfo=zone).astimezone(dt.timezone.utc).isoformat()
    results={}
    for app in sorted(OLD|set(NEW)):
        counts=[]
        for since in (None,start):
            query={'from':[{'collectionId':'events'}]}
            if since: query['where']={'fieldFilter':{'field':{'fieldPath':'createdAt'},'op':'GREATER_THAN_OR_EQUAL','value':{'timestampValue':since}}}
            data=request('https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents/cuberoot_apk_clicks_v1/'+app+':runAggregationQuery?key='+KEY,
                         {'structuredAggregationQuery':{'structuredQuery':query,'aggregations':[{'alias':'clicks','count':{}}]}})
            if not isinstance(data,list) or len(data)!=1: raise ValueError('Missing count for '+app)
            raw=data[0]['result']['aggregateFields']['clicks']['integerValue']
            if not isinstance(raw,str) or not raw.isdecimal(): raise ValueError('Invalid count for '+app)
            counts.append(int(raw))
        if counts[1]>counts[0]: raise ValueError('Inconsistent counts for '+app)
        results[app]={'lifetime':counts[0],'today':counts[1]}
    return results


def main():
    subprocess.run(['gcloud','config','set','project',PROJECT],check=True,stdout=subprocess.DEVNULL)
    token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
    if not token: raise ValueError('Sign in to Cloud Shell as the Firebase project owner')
    api=lambda path,body=None,method=None:request(RULES+path,body,token,method)
    old=api(RELEASE)['rulesetName']
    source=api(old)['source']
    # API fingerprints are output metadata. Preserve all file names/content.
    source={'files':[{'name':f['name'],'content':f['content']} for f in source['files']]}
    candidate,changed=extend(source)
    if not changed:
        print('Already activated. Checking real read permissions.');print(json.dumps(public_counts(),indent=2));return
    backup=Path.home()/('ate-counter-backup-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S')+'.json')
    with backup.open('x') as stream:
        os.chmod(backup,0o600);json.dump({'project':PROJECT,'release':RELEASE,'ruleset':old,'source':source},stream,indent=2)
    print('Saved original rules for rollback:',backup)
    check=api('projects/'+PROJECT+':test',{'source':candidate})
    if any(issue.get('severity')=='ERROR' for issue in check.get('issues',[])):
        raise ValueError('Firebase rejected candidate syntax/semantics; live rules unchanged')
    fresh=api('projects/'+PROJECT+'/rulesets',{'source':candidate})['name']
    verified=api(fresh)['source']['files']
    if [(f['name'],f['content']) for f in verified]!=[(f['name'],f['content']) for f in candidate['files']]:
        raise ValueError('Candidate source readback mismatch; live rules unchanged')
    if api(RELEASE)['rulesetName']!=old: raise ValueError('Rules changed concurrently; nothing deployed')
    def publish(name):return api(RELEASE,{'release':{'name':RELEASE,'rulesetName':name},'updateMask':'rulesetName'},'PATCH')
    try:
        publish(fresh)
        if api(RELEASE)['rulesetName']!=fresh: raise ValueError('Release verification failed')
        # Permission caches may take a short time to observe the new release.
        for attempt in range(6):
            try: counts=public_counts();break
            except (RuntimeError,ValueError):
                if attempt==5:raise
                time.sleep(5)
        print('PASS: ATE COUNTER CATEGORIES ACTIVATED; all ten real aggregate permissions verified')
        print(json.dumps(counts,indent=2))
        print('Only three category names were inserted; other rules are byte-identical.')
        print('No email was sent and no synthetic click records were created.')
    except Exception:
        try:
            current=api(RELEASE)['rulesetName']
            if current==fresh:
                publish(old)
                if api(RELEASE)['rulesetName']!=old:raise ValueError('Rollback not verified')
                print('Original live rules restored and verified.')
            elif current!=old:print('Concurrent release detected; not overwriting it. Backup:',backup)
        except Exception:print('Automatic rollback could not be verified. Original backup:',backup)
        raise


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('STOP:',str(error),file=sys.stderr);sys.exit(1)
