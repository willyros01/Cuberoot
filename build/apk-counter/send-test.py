#!/usr/bin/env python3
"""Explicit opt-in test to the same owner address as the daily report."""
import datetime as dt
import importlib.util
import os
from pathlib import Path

spec=importlib.util.spec_from_file_location('download_email',Path(__file__).with_name('resend-daily.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


def main():
    key=os.environ.get('CUBEROOT_RESEND_API_KEY','').strip()
    if not key.startswith('re_'):raise ValueError('Existing Resend secret is missing')
    local=dt.datetime.now(dt.timezone.utc).astimezone(module.counts.TZ)
    day=local.date() if local.time()>=dt.time(9,17) else local.date()-dt.timedelta(days=1)
    cutoff=dt.datetime.combine(day,dt.time(9,17),tzinfo=module.counts.TZ)
    report_date,body=module.build_report(cutoff.astimezone(dt.timezone.utc))
    if report_date!=day.isoformat():raise ValueError('Wrong completed reporting date')
    rendered=module.build_html_report(body)
    if rendered.count('<tr style=')!=12:raise ValueError('Expected header, ten categories and total')
    for label in ['ATE Windows','ATE Mac Universal','ATE Android']:
        if label not in rendered:raise ValueError('Missing ATE row')
    # Separate from the daily key; re-running the same workflow cannot duplicate it.
    run=os.environ['GITHUB_RUN_ID']
    subject='Cuberoot Download Clicks - '+report_date+' (TEST)'
    email_id=module.send_email(key,subject,body,'cuberoot-download-test-'+run,html_body=rendered)
    print('PASS: Resend accepted owner test email; ID='+email_id)
    print('Subject: '+subject)
    print('Completed 09:17 Toronto cutoff: '+cutoff.isoformat())
    print('Clicks after this cutoff belong to the next scheduled report. Verify Inbox separately.')


if __name__=='__main__':main()
