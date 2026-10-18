/**
 * Cuberoot Daily APK Mailer — Google Apps Script
 * Trigger: cron-job.org -> deployed Apps Script web app -> MailApp.
 * No app passwords, Google Cloud project, GitHub tokens or Firebase changes.
 *
 * Install as the owner of willyros01@gmail.com. Web app must execute as Me.
 * Keep the private URL containing ?token=... in cron-job.org only.
 * Designed to replace the abandoned SMTP / Gmail app-password experiment.
 */
const APK_EMAIL = 'willyros01@gmail.com';
const APK_ZONE = 'America/Toronto';
const APK_FIREBASE_PROJECT = 'split-it-44dea';
// This is an existing public Firebase web API key, NOT a secret.
const APK_FIREBASE_KEY = 'AIzaSyD2ZzzJCOz786VqTMZHpgVG_-FOi-KYI78';
const APK_APPS = [
  ['fidunio', 'FIDUNIO'],
  ['scorecard', 'Scorecard'],
  ['fairpot', 'Fairpot'],
  ['wire', 'Wire'],
  ['spendrecorder', 'SpendRecorder'],
  ['cloud-files', 'Cloud Files'],
  ['marker', 'The Marker']
];

/** Run once from the Apps Script editor. Asks Google for permission to send mail. */
function initialize() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('CRON_TOKEN')) {
    properties.setProperty('CRON_TOKEN', Utilities.getUuid() + '-' + Utilities.getUuid());
  }
  const remaining = MailApp.getRemainingDailyQuota();
  Logger.log('READY. Google mail permission granted. Remaining recipient quota: ' + remaining);
  Logger.log('Next: Deploy > New deployment > Web app > Execute as Me > Anyone.');
}

/** Run after web app deployment. Copy the entire URL shown in the Execution log. */
function showCronUrl() {
  const url = ScriptApp.getService().getUrl();
  const token = PropertiesService.getScriptProperties().getProperty('CRON_TOKEN');
  if (!url || !token) throw new Error('Run initialize and deploy as a Web app first.');
  Logger.log('PRIVATE CRON URL (do not share):');
  Logger.log(url + '?token=' + encodeURIComponent(token));
}

/** Endpoint invoked by cron-job.org with HTTP GET (no login required). */
function doGet(request) {
  const expected = PropertiesService.getScriptProperties().getProperty('CRON_TOKEN');
  if (!expected || !request || !request.parameter || request.parameter.token !== expected) {
    return HtmlService.createHtmlOutput('<!doctype html><title>Cuberoot</title><pre>DENIED</pre>');
  }
  // A thrown error is visible in Apps Script Executions; cron-job.org may also
  // detect an HTTP failure. If count retrieval fails, an error email is sent.
  const result = sendYesterday_();
  return HtmlService.createHtmlOutput('<!doctype html><title>Cuberoot</title><pre>' + result + '</pre>');
}

/** Prevent duplicates if cron retries or two requests arrive simultaneously. */
function sendYesterday_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const date = previousTorontoDate_();
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('APK_SENT_' + date) === 'yes') {
      return 'PASS ALREADY_SENT ' + date;
    }
    try {
      const summary = buildSummary_(date);
      if (MailApp.getRemainingDailyQuota() < 1) {
        throw new Error('Gmail daily sending quota exhausted');
      }
      MailApp.sendEmail({
        to: APK_EMAIL,
        subject: 'Cuberoot APK clicks - ' + date,
        body: summary,
        name: 'Cuberoot APK Reporter'
      });
      props.setProperty('APK_SENT_' + date, 'yes');
      Logger.log('PASS: sent and recorded ' + date);
      return 'PASS SENT ' + date;
    } catch (error) {
      Logger.log('FAIL: ' + error);
      // The failure report contains no invented click counts.
      if (props.getProperty('APK_FAILURE_SENT_' + date) !== 'yes') {
        try {
          MailApp.sendEmail({
            to: APK_EMAIL,
            subject: 'Cuberoot APK report FAILURE - ' + date,
            body: 'The daily seven-app APK click report for ' + date +
                  ' could not be verified or sent. No counts were invented. ' +
                  'Open Google Apps Script > Executions for the failure details.',
            name: 'Cuberoot APK Reporter'
          });
          props.setProperty('APK_FAILURE_SENT_' + date, 'yes');
        } catch (mailError) {
          Logger.log('FAIL: Could not send failure-status email: ' + mailError);
        }
      }
      throw error;
    }
  } finally {
    lock.releaseLock();
  }
}

/** Yesterday as a Toronto calendar date, independent of UTC day boundary. */
function previousTorontoDate_() {
  const today = Utilities.formatDate(new Date(), APK_ZONE, 'yyyy-MM-dd');
  const yesterdayUtcNoon = Date.parse(today + 'T12:00:00Z') - 86400000;
  return new Date(yesterdayUtcNoon).toISOString().slice(0, 10);
}

/** Exact local midnight in UTC, including spring and fall DST transitions. */
function torontoMidnightUtc_(day) {
  const target = Date.parse(day + 'T00:00:00Z');
  let guess = target + 5 * 3600000;
  for (let i = 0; i < 5; i++) {
    const local = Utilities.formatDate(new Date(guess), APK_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
    const delta = Date.parse(local + 'Z') - target;
    guess -= delta;
    if (delta === 0) break;
  }
  const check = Utilities.formatDate(new Date(guess), APK_ZONE, "yyyy-MM-dd'T'HH:mm:ss");
  if (check !== day + 'T00:00:00') throw new Error('Toronto midnight conversion failed');
  return new Date(guess).toISOString();
}

function followingDate_(day) {
  return new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
}

function countRequest_(app, start, end) {
  const query = {from: [{collectionId: 'events'}]};
  if (start && end) {
    query.where = {compositeFilter: {
      op: 'AND',
      filters: [
        {fieldFilter: {field: {fieldPath: 'createdAt'}, op: 'GREATER_THAN_OR_EQUAL',
                       value: {timestampValue: start}}},
        {fieldFilter: {field: {fieldPath: 'createdAt'}, op: 'LESS_THAN',
                       value: {timestampValue: end}}}
      ]
    }};
  }
  const payload = {structuredAggregationQuery: {
    structuredQuery: query,
    aggregations: [{alias: 'clicks', count: {}}]
  }};
  const base = 'https://firestore.googleapis.com/v1/projects/' + APK_FIREBASE_PROJECT +
    '/databases/(default)/documents/cuberoot_apk_clicks_v1/';
  return {
    url: base + encodeURIComponent(app) + ':runAggregationQuery?key=' + APK_FIREBASE_KEY,
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
}

function verifiedCount_(response) {
  const status = response.getResponseCode();
  if (status !== 200) throw new Error('Firestore count request returned HTTP ' + status);
  const rows = JSON.parse(response.getContentText());
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0].result ||
      !rows[0].result.aggregateFields || !rows[0].result.aggregateFields.clicks) {
    throw new Error('Incomplete Firestore aggregate count');
  }
  const raw = rows[0].result.aggregateFields.clicks.integerValue;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new Error('Invalid APK click count');
  }
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Unsafe APK click count');
  return number;
}

/** Calculate seven yesterday/lifetime pairs in one parallel fetch batch. */
function buildSummary_(day) {
  const start = torontoMidnightUtc_(day);
  const end = torontoMidnightUtc_(followingDate_(day));
  const requests = [];
  APK_APPS.forEach(function(app) {
    requests.push(countRequest_(app[0], start, end));
    requests.push(countRequest_(app[0], null, null));
  });
  const responses = UrlFetchApp.fetchAll(requests);
  if (responses.length !== APK_APPS.length * 2) {
    throw new Error('Missing Firebase responses');
  }
  const lines = [
    'CUBEROOT APK DOWNLOAD REPORT',
    'Reporting date: ' + day + ' (America/Toronto)',
    '',
    'APP                         YESTERDAY    ALL TIME'
  ];
  let dailyTotal = 0;
  let lifetimeTotal = 0;
  APK_APPS.forEach(function(app, index) {
    const daily = verifiedCount_(responses[index * 2]);
    const lifetime = verifiedCount_(responses[index * 2 + 1]);
    if (daily > lifetime) throw new Error('Inconsistent count for ' + app[0]);
    dailyTotal += daily;
    lifetimeTotal += lifetime;
    const title = app[1].padEnd(27, ' ');
    lines.push(title + String(daily).padStart(9, ' ') + String(lifetime).padStart(12, ' '));
  });
  if (!Number.isSafeInteger(dailyTotal) || !Number.isSafeInteger(lifetimeTotal)) {
    throw new Error('Unsafe grand totals');
  }
  lines.push('', 'ALL SEVEN'.padEnd(27, ' ') + String(dailyTotal).padStart(9, ' ') + String(lifetimeTotal).padStart(12, ' '));
  lines.push('', 'Counts are recorded APK-link clicks, not verified downloads or installations.');
  lines.push('Source: Cuberoot public Firebase click aggregates (split-it-44dea).');
  return lines.join('\n');
}
