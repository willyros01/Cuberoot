#!/usr/bin/env python3
"""One-time Cloud Shell setup. No GitHub CLI, no GitHub API or account login.
Keep the owner-only Firebase rules; add one read-only email reporter, send a
real test Gmail, and print ONE value to paste into GitHub Actions secret storage.
Never paste the printed configuration into ChatGPT, email or repository files.
"""
import datetime as dt
import getpass
import hashlib
import json
import pathlib
import re
import secrets
import smtplib
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

PROJECT = 'split-it-44dea'
PROJECT_NUMBER = '153404639150'
REPO = 'willyros01/Cuberoot'
OWNER_EMAIL = 'willyros01@gmail.com'
REPORTER_EMAIL = 'willyros01+cuberoot-apk-reporter@gmail.com'
API_KEY = 'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78'  # Public web key
RULESET = 'projects/split-it-44dea/rulesets/e795cb31-c0a1-4730-898b-5e6bd7ca4cf6'
RULESET_SHA = '9e9cb47886c728628bc7c3d11e4ece77d38b8a6df00607d33c9705267f02ecf1'
RELEASE = 'projects/split-it-44dea/releases/cloud.firestore'
BASE = 'https://firebaserules.googleapis.com/v1/'
SECRET_URL = 'https://github.com/willyros01/Cuberoot/settings/secrets/actions/new'
# Pinned read-only copy: exact production sender version.
SENDER_COMMIT = '21aba7988612d8ce41181ab62a14609e130824f6'
OUT = pathlib.Path('mail-status.txt')

def fail(msg):
    raise RuntimeError(msg)

def shell(args):
    p = subprocess.run(args, capture_output=True, text=True, timeout=55)
    if p.returncode:
        fail('Google Cloud Shell permission or login is unavailable. Check gcloud auth list.')
    return p.stdout.strip()

def sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def api(method, url, token=None, data=None):
    body = None if data is None else json.dumps(data, separators=(',', ':')).encode('utf-8')
    headers = {'Accept':'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if body is not None:
        headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=35) as response:
            return json.loads(response.read(2_000_000))
    except urllib.error.HTTPError as e:
        # No external error body or token is shown.
        fail('Google API HTTP ' + str(e.code) + '. No email schedule enabled.')

def rule(method, path, token, data=None):
    return api(method, BASE+path, token, data)

def check_project_and_rules():
    project = json.loads(shell(['gcloud','projects','describe',PROJECT,'--format=json']))
    if project.get('projectId')!=PROJECT or str(project.get('projectNumber'))!=PROJECT_NUMBER or project.get('lifecycleState')!='ACTIVE':
        fail('Wrong Google project; stopped.')
    token = shell(['gcloud','auth','print-access-token'])
    release=rule('GET', RELEASE, token)
    if release.get('name')!=RELEASE or release.get('rulesetName')!=RULESET:
        fail('Firestore rules changed from the last verified baseline. Stopped safely.')
    files=rule('GET', RULESET, token).get('source',{}).get('files',[])
    if len(files)!=1 or files[0].get('name')!='firestore.rules':
        fail('Unexpected Firestore rule files; stopped.')
    source=files[0].get('content','')
    if sha(source)!=RULESET_SHA:
        fail('Firestore rules hash changed; stopped.')
    old='allow get, list: if isOwner();'
    if source.count(old)!=1 or source.count('allow update, delete: if false;')!=1:
        fail('Unexpected APK collection security policy.')
    if source.count('match /households/{code}/{document=**}')!=1:
        fail('Existing split-it households rule mismatch; stopped.')
    return token,release,source

def run():
    token, release, source=check_project_and_rules()
    print('PASS: Existing Firebase project and household rules verified.',flush=True)
    print('Use a Gmail APP password (not your usual Google account password):')
    print('https://myaccount.google.com/apppasswords')
    pwd=''.join(getpass.getpass('Enter 16-character Gmail app password: ').split())
    if len(pwd)!=16 or not pwd.isascii() or not pwd.isalnum():
        fail('Invalid Gmail app password length or characters.')
    with smtplib.SMTP_SSL('smtp.gmail.com',465,context=ssl.create_default_context(),timeout=25) as smtp:
        smtp.login(OWNER_EMAIL,pwd)
    print('PASS: Gmail sign-in verified.',flush=True)
    reporter_password=secrets.token_urlsafe(36)
    signup=api('POST','https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+API_KEY,
               data={'email':REPORTER_EMAIL,'password':reporter_password,'returnSecureToken':True})
    uid=signup.get('localId')
    if (not isinstance(uid,str) or not re.fullmatch('[A-Za-z0-9]{16,128}',uid)
         or signup.get('email','').lower()!=REPORTER_EMAIL.lower()):
        fail('Reporter account creation did not return the expected identity.')
    print('PASS: Separate Firebase reporter created.',flush=True)
    old='allow get, list: if isOwner();'
    new="allow get, list: if isOwner() || (request.auth != null && request.auth.uid == '"+uid+"');"
    proposal=source.replace(old,new,1)
    if (proposal.replace(new,old,1)!=source or proposal.count(uid)!=1 or
        'allow create: if allowedApp() && validRecord();' not in proposal or
        proposal.count('match /households/{code}/{document=**}')!=1):
        fail('Rules comparison failed. No publishing attempted.')
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d-%H%M%S')
    backup=pathlib.Path('email-original-rules-'+stamp+'.txt')
    backup.write_text(source,encoding='utf-8')
    # Refresh active release before publishing; prevent accidental overwrites.
    current=rule('GET',RELEASE,token)
    if current.get('rulesetName')!=RULESET or current.get('updateTime')!=release.get('updateTime'):
        fail('Rules changed during setup. Original untouched.')
    candidate=rule('POST','projects/'+PROJECT+'/rulesets',token,{
       'source':{'files':[{'name':'firestore.rules','content':proposal}]},
       'attachment_point':'firestore.googleapis.com/projects/'+PROJECT_NUMBER+'/databases/(default)'
    })
    name=candidate.get('name','')
    if not isinstance(name,str) or not re.fullmatch(r'projects/split-it-44dea/rulesets/[A-Za-z0-9_-]+',name):
        fail('Firebase ruleset creation response unclear. Stopped.')
    files=rule('GET',name,token).get('source',{}).get('files',[])
    if len(files)!=1 or files[0].get('content')!=proposal:
        fail('Published candidate did not match; stopped.')
    if rule('GET',RELEASE,token).get('rulesetName')!=RULESET:
        fail('Rules changed before activation; stopped.')
    changed=rule('PATCH',RELEASE,token,{
       'release':{'name':RELEASE,'rulesetName':name},'updateMask':'rulesetName'
    })
    if changed.get('rulesetName')!=name or rule('GET',RELEASE,token).get('rulesetName')!=name:
        fail('Cannot verify Firestore read-only rule activation.')
    print('PASS: Private reporter added. Household rules and public click writes preserved.',flush=True)
    settings={'reporter_email':REPORTER_EMAIL,'reporter_password':reporter_password,'gmail_app_password':pwd}
    # Use the actual audited production sender to read real Firestore and send
    # one real email. Nothing fabricated; cannot enable a future schedule here.
    url='https://raw.githubusercontent.com/'+REPO+'/'+SENDER_COMMIT+'/build/apk-counter/daily-email.py'
    try:
        with urllib.request.urlopen(url,timeout=40) as result:
            sender=result.read(150_000)
    except Exception:
        fail('Unable to retrieve verified email sender. No schedule configured.')
    if b'APK_COUNTER_MAIL_CONFIG' not in sender or b'firebase_id_token' not in sender:
        fail('Unexpected email sender version; no schedule configured.')
    with tempfile.TemporaryDirectory() as temp:
        local=pathlib.Path(temp)/'daily-email.py'
        local.write_bytes(sender)
        import os
        env=dict(os.environ)
        env['APK_COUNTER_MAIL_CONFIG']=json.dumps(settings,separators=(',',':'))
        p=subprocess.run([sys.executable,str(local)],capture_output=True,text=True,env=env,timeout=180)
    if p.returncode!=0:
        fail('Real email test failed. Reporter rule exists; daily schedule still NOT configured.')
    print('PASS: A real statistics email was sent.',flush=True)
    print('LAST STEP — one GitHub secret, no GitHub login in Cloud Shell.')
    print('1) Open: '+SECRET_URL)
    print('2) Name: APK_COUNTER_MAIL_CONFIG')
    print('3) Paste the following value into the Secret box (never into ChatGPT):')
    print(json.dumps(settings,separators=(',',':')))
    print('4) Click Add secret. The next scheduled report will use it.')
    return 'PASS: REAL EMAIL SENT — ADD ONE GITHUB SECRET TO ENABLE DAILY EMAIL'

if __name__=='__main__':
    try:
        result=run()
        OUT.write_text(result+'\n',encoding='utf-8')
        print(result)
    except Exception as exc:
        message=str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__
        status='FAIL: '+message[:200]
        OUT.write_text(status+'\n',encoding='utf-8')
        print(status,file=sys.stderr)
        sys.exit(1)
