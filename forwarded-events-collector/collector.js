#!/usr/bin/env node
/**
 * Forwarded Events -> JSON collector for Active Directory activity.
 *
 * Runs on the Windows Event Collector (the machine whose "Forwarded Events" log you see in
 * Event Viewer). Reads new events with wevtutil.exe (built into Windows), normalises them into
 * readable activity records, and keeps ONE JSON file up to date.
 *
 *  - Incremental: uses a Windows event bookmark on the ForwardedEvents channel, so late-arriving
 *    events from offline machines are still picked up and nothing is read twice.
 *  - No duplicates: events are keyed on sourceComputer|channel|recordId.
 *  - Safe output: temp file + rename, so readers (e.g. a Docker container) never see a half file.
 *  - No overlapping runs: lock file with stale-lock detection.
 *  - Bounded size: retention by age and by max event count.
 *  - Zero npm dependencies. Node.js 18+.
 *
 * Usage:  node collector.js [options]          (run as Administrator or an 'Event Log Readers' member)
 *   --base-dir <dir>          default C:\UnoChariot     (data\, state\, logs\ are created inside)
 *   --output <file>           default ad-forwarded-events.json
 *   --channel <name>          default ForwardedEvents
 *   --all-events              keep every event ID, not just the AD activity list
 *   --include-machine-accounts  keep logon/logoff noise from computer accounts (names ending in $)
 *   --lookback-hours <n>      first run only, default 24
 *   --retention-days <n>      default 7
 *   --max-events <n>          max events kept in the file, default 200000
 *   --batch-size <n>          events per wevtutil call, default 5000
 *   --max-per-run <n>         default 100000 (the rest is picked up next run)
 *   --include-message         use RenderedXml to include the human-readable message (slower, bigger)
 *   --verbose
 * Exit codes: 0 success/skipped, 1 failure (details in logs\ and data\forwarded-collector-status.json)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// ------------------------------------------------------------------ options
function parseArgs(argv) {
  const o = {
    baseDir: process.env.COLLECTOR_BASE_DIR || 'C:\\UnoChariot',
    output: 'ad-forwarded-events.json',
    channel: 'ForwardedEvents',
    allEvents: false,
    includeMachineAccounts: false,
    lookbackHours: 24,
    retentionDays: 7,
    maxEvents: 200000,
    batchSize: 5000,
    maxPerRun: 100000,
    includeMessage: false,
    verbose: false,
  };
  const num = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid value for ${name}: ${v}`);
    return n;
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`); return argv[++i]; };
    switch (a) {
      case '--base-dir': o.baseDir = next(); break;
      case '--output': o.output = next(); break;
      case '--channel': o.channel = next(); break;
      case '--all-events': o.allEvents = true; break;
      case '--include-machine-accounts': o.includeMachineAccounts = true; break;
      case '--lookback-hours': o.lookbackHours = num(next(), a); break;
      case '--retention-days': o.retentionDays = num(next(), a); break;
      case '--max-events': o.maxEvents = num(next(), a); break;
      case '--batch-size': o.batchSize = num(next(), a); break;
      case '--max-per-run': o.maxPerRun = num(next(), a); break;
      case '--include-message': o.includeMessage = true; break;
      case '--verbose': o.verbose = true; break;
      case '-h': case '--help':
        console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0);
      default: throw new Error(`Unknown option: ${a}`);
    }
  }
  return o;
}

// ------------------------------------------------------------------ AD activity catalogue
const ACTIVITIES = {
  1102: 'Security log cleared',
  4624: 'Successful logon', 4625: 'Failed logon', 4634: 'Logoff', 4647: 'User-initiated logoff',
  4648: 'Logon with explicit credentials', 4672: 'Special privileges assigned to logon',
  4662: 'Operation performed on AD object', 4719: 'Audit policy changed',
  4720: 'User account created', 4722: 'User account enabled', 4723: 'Password change attempt',
  4724: 'Password reset attempt', 4725: 'User account disabled', 4726: 'User account deleted',
  4738: 'User account changed', 4740: 'User account locked out', 4767: 'User account unlocked',
  4781: 'Account name changed',
  4727: 'Global security group created', 4728: 'Member added to global security group',
  4729: 'Member removed from global security group', 4730: 'Global security group deleted',
  4731: 'Local security group created', 4732: 'Member added to local security group',
  4733: 'Member removed from local security group', 4734: 'Local security group deleted',
  4735: 'Local security group changed', 4737: 'Global security group changed',
  4754: 'Universal security group created', 4755: 'Universal security group changed',
  4756: 'Member added to universal security group', 4757: 'Member removed from universal security group',
  4758: 'Universal security group deleted',
  4741: 'Computer account created', 4742: 'Computer account changed', 4743: 'Computer account deleted',
  4768: 'Kerberos TGT requested', 4769: 'Kerberos service ticket requested',
  4771: 'Kerberos pre-authentication failed', 4776: 'NTLM credential validation',
  5136: 'Directory object modified', 5137: 'Directory object created', 5138: 'Directory object undeleted',
  5139: 'Directory object moved', 5141: 'Directory object deleted',
};
const LOGON_EVENTS = new Set([4624, 4625, 4634, 4647, 4648, 4672]);
const LOGON_TYPES = {
  2: 'Interactive', 3: 'Network', 4: 'Batch', 5: 'Service', 7: 'Unlock', 8: 'NetworkCleartext',
  9: 'NewCredentials', 10: 'RemoteInteractive (RDP)', 11: 'CachedInteractive',
};
const NT_STATUS = {
  '0xc000006a': 'Wrong password', '0xc0000064': 'User does not exist', '0xc000006d': 'Bad username or password',
  '0xc0000234': 'Account locked out', '0xc0000072': 'Account disabled', '0xc000006f': 'Outside allowed logon hours',
  '0xc0000070': 'Workstation restriction', '0xc0000071': 'Password expired', '0xc0000193': 'Account expired',
  '0xc0000224': 'Password must be changed', '0xc000015b': 'Logon type not granted', '0xc0000133': 'Clock out of sync',
};
const KERBEROS_STATUS = {
  '0x6': 'User does not exist', '0x12': 'Account disabled, expired or locked', '0x17': 'Password expired',
  '0x18': 'Wrong password', '0x25': 'Clock out of sync',
};
const DS_OPERATIONS = { '%%14674': 'Value added', '%%14675': 'Value deleted' };

// ------------------------------------------------------------------ helpers
let LOG_FILE = null;
let VERBOSE = false;
function log(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  if (LOG_FILE) { try { fs.appendFileSync(LOG_FILE, line + os.EOL); } catch { /* ignore */ } }
  if (VERBOSE || level === 'ERROR') console.log(line);
}

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

/** Write to a temp file in the same folder, then rename over the target (atomic on NTFS). */
function writeAtomic(file, content) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8' });       // Node writes UTF-8 without BOM
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      if (fs.existsSync(file)) { try { fs.copyFileSync(file, `${file}.bak`); } catch { /* best effort */ } }
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || attempt === 10) throw e;
      log('WARN', `File busy (${e.code}) replacing ${path.basename(file)}, retry ${attempt}`);
      sleepSync(500 * attempt);                               // a reader may hold it open briefly
    }
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.trim() ? JSON.parse(text) : null;
}

/** Simple lock file; a lock left by a dead process or older than maxAgeMs is taken over. */
function acquireLock(lockFile, maxAgeMs) {
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      fs.closeSync(fd);
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let stale = false;
      try {
        const info = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
        const age = Date.now() - fs.statSync(lockFile).mtimeMs;
        let alive = true;
        try { process.kill(info.pid, 0); } catch { alive = false; }
        stale = !alive || age > maxAgeMs;
      } catch { stale = true; }
      if (!stale) return false;
      log('WARN', 'Removing stale lock file.');
      try { fs.unlinkSync(lockFile); } catch { /* raced */ }
    }
  }
  return false;
}

// ------------------------------------------------------------------ query building
function idRanges(ids, maxGap = 50) {
  const s = [...new Set(ids)].sort((a, b) => a - b);
  const ranges = [];
  let start = s[0], end = s[0];
  for (const id of s.slice(1)) {
    if (id - end <= maxGap) end = id;
    else { ranges.push([start, end]); start = end = id; }
  }
  ranges.push([start, end]);
  return ranges;
}

function buildXPath({ allEvents, lookbackMs }) {
  const conds = [];
  if (!allEvents) {
    // Windows rejects queries with many individual IDs, so use ranges and filter exactly afterwards.
    const parts = idRanges(Object.keys(ACTIVITIES).map(Number)).map(([a, b]) =>
      a === b ? `EventID=${a}` : `(EventID>=${a} and EventID<=${b})`);
    conds.push(`(${parts.join(' or ')})`);
  }
  if (lookbackMs) conds.push(`TimeCreated[timediff(@SystemTime) <= ${lookbackMs}]`);
  return conds.length ? `*[System[${conds.join(' and ')}]]` : '*';
}

// ------------------------------------------------------------------ wevtutil
const WEVTUTIL = process.env.WEVTUTIL_PATH ||
  path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wevtutil.exe');

function decodeOutput(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.slice(2).toString('utf16le');
  if (buf.length >= 4 && buf[1] === 0 && buf[3] === 0) return buf.toString('utf16le');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return buf.toString('latin1'); }                   // last resort for legacy code pages
}

function queryBatch({ channel, xpath, count, bookmarkIn, bookmarkOut, rendered }) {
  const args = ['qe', channel, `/q:${xpath}`, `/c:${count}`, '/rd:false', `/f:${rendered ? 'RenderedXml' : 'xml'}`];
  if (bookmarkIn) args.push(`/bm:${bookmarkIn}`);
  args.push(`/sbm:${bookmarkOut}`);
  try {
    const out = execFileSync(WEVTUTIL, args, { maxBuffer: 1024 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return decodeOutput(out);
  } catch (e) {
    const msg = ((e.stderr && decodeOutput(e.stderr)) || e.message || '').trim();
    if (/access is denied/i.test(msg)) {
      throw new Error(`Access denied reading '${channel}'. Run as Administrator/SYSTEM or add the account to 'Event Log Readers'.`);
    }
    throw new Error(`wevtutil failed: ${msg}`);
  }
}

// ------------------------------------------------------------------ XML parsing (event schema only)
function decodeXml(s) {
  if (s == null) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
const attr = (xml, tag, name) => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}=(['"])(.*?)\\1`));
  return m ? decodeXml(m[2]) : null;
};
const text = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1].trim()) : null;
};

function parseEvents(xmlStream) {
  const events = [];
  const re = /<Event[\s>][\s\S]*?<\/Event>/g;
  let m;
  while ((m = re.exec(xmlStream)) !== null) {
    const x = m[0];
    const sys = (x.match(/<System>([\s\S]*?)<\/System>/) || [, ''])[1];
    const data = {};
    const dataRe = /<Data(?:\s+Name=(['"])(.*?)\1)?\s*(?:\/>|>([\s\S]*?)<\/Data>)/g;
    let d, i = 0;
    const evData = (x.match(/<EventData>([\s\S]*?)<\/EventData>/) || [, ''])[1];
    while ((d = dataRe.exec(evData)) !== null) {
      data[d[2] ? decodeXml(d[2]) : `Data_${i}`] = d[3] !== undefined ? decodeXml(d[3]) : '';
      i++;
    }
    events.push({
      provider: attr(sys, 'Provider', 'Name'),
      eventId: Number(text(sys, 'EventID')),
      level: Number(text(sys, 'Level') || 0),
      task: Number(text(sys, 'Task') || 0),
      keywords: text(sys, 'Keywords'),
      timeCreated: attr(sys, 'TimeCreated', 'SystemTime'),
      recordId: Number(text(sys, 'EventRecordID')),
      channel: text(sys, 'Channel'),
      computer: text(sys, 'Computer'),
      data,
      message: text(x, 'Message'),
    });
  }
  return events;
}

// ------------------------------------------------------------------ normalisation
const clean = (v) => (v === undefined || v === null || v === '' || v === '-' ? null : v);
const account = (domain, user) => {
  const u = clean(user);
  if (!u) return null;
  const dmn = clean(domain);
  return dmn ? `${dmn}\\${u}` : u;
};

function outcomeOf(keywords) {
  try {
    const k = BigInt(keywords || '0');
    if (k & 0x0020000000000000n) return 'Success';
    if (k & 0x0010000000000000n) return 'Failure';
  } catch { /* ignore */ }
  return null;
}

function toActivity(ev, collectorHost, includeMessage) {
  const d = ev.data;
  const id = ev.eventId;
  const status = (clean(d.Status) || clean(d.FailureCode) || '').toLowerCase();
  const subStatus = (clean(d.SubStatus) || '').toLowerCase();
  const reason = id === 4771 || id === 4768
    ? KERBEROS_STATUS[status] || null
    : NT_STATUS[subStatus] || NT_STATUS[status] || null;
  const logonType = clean(d.LogonType) ? Number(d.LogonType) : null;
  const isGroupEvent = (id >= 4727 && id <= 4737) || (id >= 4754 && id <= 4758);

  const rec = {
    id: `${ev.computer}|${ev.channel}|${ev.recordId}`,
    timeCreatedUtc: new Date(ev.timeCreated).toISOString(),
    eventId: id,
    activity: ACTIVITIES[id] || `Event ${id}`,
    outcome: outcomeOf(ev.keywords),
    sourceComputer: ev.computer,
    channel: ev.channel,
    recordId: ev.recordId,
    actor: account(d.SubjectDomainName, d.SubjectUserName),
    targetUser: isGroupEvent ? null : account(d.TargetDomainName, d.TargetUserName),
    group: isGroupEvent ? account(d.TargetDomainName, d.TargetUserName) : null,
    member: isGroupEvent ? clean(d.MemberName) || clean(d.MemberSid) : null,
    logonType,
    logonTypeName: logonType != null ? LOGON_TYPES[logonType] || String(logonType) : null,
    ipAddress: clean(d.IpAddress) && !['::1', '127.0.0.1'].includes(d.IpAddress) ? d.IpAddress.replace(/^::ffff:/, '') : clean(d.IpAddress),
    workstation: clean(d.WorkstationName) || clean(d.Workstation),
    failureReason: reason,
    statusCode: clean(d.SubStatus) && d.SubStatus !== '0x0' ? d.SubStatus : clean(d.Status) || clean(d.FailureCode),
    serviceName: clean(d.ServiceName),
    objectDN: clean(d.ObjectDN),
    attribute: clean(d.AttributeLDAPDisplayName),
    attributeValue: clean(d.AttributeValue),
    operation: DS_OPERATIONS[d.OperationType] || clean(d.OperationType),
    provider: ev.provider,
    collectorHost,
    collectedAtUtc: new Date().toISOString(),
    data: d,
  };
  if (includeMessage && ev.message) rec.message = ev.message;
  for (const k of Object.keys(rec)) if (rec[k] === null) delete rec[k];   // keep the file compact
  return rec;
}

function isMachineAccountNoise(ev) {
  if (!LOGON_EVENTS.has(ev.eventId)) return false;
  const u = ev.data.TargetUserName || ev.data.SubjectUserName || '';
  return u.endsWith('$') || u === 'ANONYMOUS LOGON';
}

// ------------------------------------------------------------------ main
function main() {
  const opt = parseArgs(process.argv);
  VERBOSE = opt.verbose;
  const dirs = { data: path.join(opt.baseDir, 'data'), state: path.join(opt.baseDir, 'state'), logs: path.join(opt.baseDir, 'logs') };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  LOG_FILE = path.join(dirs.logs, `forwarded-collector-${new Date().toISOString().slice(0, 10)}.log`);

  const outFile = path.join(dirs.data, opt.output);
  const statusFile = path.join(dirs.data, 'forwarded-collector-status.json');
  const bookmarkFile = path.join(dirs.state, `${opt.channel}.bookmark.xml`);
  const pending = [path.join(dirs.state, `${opt.channel}.bookmark.a.xml`), path.join(dirs.state, `${opt.channel}.bookmark.b.xml`)];
  const lockFile = path.join(dirs.state, 'forwarded-collector.lock');
  const collectorHost = os.hostname();
  const started = Date.now();

  const writeStatus = (status, extra) => {
    try { writeAtomic(statusFile, JSON.stringify({ status, collectorHost, channel: opt.channel, runAtUtc: new Date().toISOString(), ...extra }, null, 2)); }
    catch (e) { log('WARN', `Could not write status: ${e.message}`); }
  };

  // Old log cleanup (14 days)
  for (const f of fs.readdirSync(dirs.logs)) {
    const p = path.join(dirs.logs, f);
    if (/^forwarded-collector-.*\.log$/.test(f) && Date.now() - fs.statSync(p).mtimeMs > 14 * 864e5) fs.unlinkSync(p);
  }

  if (!acquireLock(lockFile, 30 * 60 * 1000)) { log('WARN', 'Another run is active; skipping.'); return 0; }
  try {
    log('INFO', `Run started (user ${os.userInfo().username}, channel ${opt.channel})`);

    // 1. Load the existing file (fall back to .bak if it is corrupt)
    const byId = new Map();
    let existing = null;
    try { existing = readJson(outFile); }
    catch (e) {
      log('WARN', `Output JSON unreadable (${e.message}); trying backup.`);
      try { fs.copyFileSync(outFile, `${outFile}.corrupt-${Date.now()}`); } catch { /* ignore */ }
      try { existing = readJson(`${outFile}.bak`); } catch { log('ERROR', 'Backup unreadable too; starting fresh.'); }
    }
    for (const e of (existing && existing.events) || []) if (e && e.id) byId.set(e.id, e);
    log('INFO', `Loaded ${byId.size} existing events.`);

    // 2. Read new events in batches, chaining bookmarks
    const firstRun = !fs.existsSync(bookmarkFile);
    const xpath = buildXPath({ allEvents: opt.allEvents, lookbackMs: firstRun ? opt.lookbackHours * 3600000 : 0 });
    log('INFO', `${firstRun ? 'First run' : 'Incremental run'}; query: ${xpath}`);
    for (const p of pending) { try { fs.unlinkSync(p); } catch { /* none */ } }

    let readFrom = firstRun ? null : bookmarkFile;
    let fetched = 0, added = 0, skippedNoise = 0, batchNo = 0;
    const wanted = new Set(Object.keys(ACTIVITIES).map(Number));
    while (fetched < opt.maxPerRun) {
      const out = pending[batchNo % 2];
      const count = Math.min(opt.batchSize, opt.maxPerRun - fetched);
      const xml = queryBatch({ channel: opt.channel, xpath, count, bookmarkIn: readFrom, bookmarkOut: out, rendered: opt.includeMessage });
      const raw = parseEvents(xml);
      batchNo++;
      if (raw.length === 0 || !fs.existsSync(out)) { try { fs.unlinkSync(out); } catch { /* none */ } break; }
      readFrom = out;
      fetched += raw.length;
      for (const ev of raw) {
        if (!opt.allEvents && !wanted.has(ev.eventId)) continue;
        if (!opt.includeMachineAccounts && isMachineAccountNoise(ev)) { skippedNoise++; continue; }
        if (!ev.timeCreated || Number.isNaN(Date.parse(ev.timeCreated))) continue;
        const rec = toActivity(ev, collectorHost, opt.includeMessage);
        if (!byId.has(rec.id)) { byId.set(rec.id, rec); added++; }
      }
      log('INFO', `Batch ${batchNo}: ${raw.length} events read.`);
      if (raw.length < count) break;
    }

    // 3. Retention (age, then size - keep newest)
    const cutoff = Date.now() - opt.retentionDays * 864e5;
    let kept = [...byId.values()].filter((e) => Date.parse(e.timeCreatedUtc) >= cutoff)
      .sort((a, b) => a.timeCreatedUtc.localeCompare(b.timeCreatedUtc));
    if (kept.length > opt.maxEvents) kept = kept.slice(kept.length - opt.maxEvents);
    const pruned = byId.size - kept.length;

    // 4. Publish JSON first, then commit the bookmark. A crash in between only causes a re-read,
    //    which the id-based de-duplication absorbs.
    writeAtomic(outFile, JSON.stringify({
      schemaVersion: 1,
      source: 'forwarded-events-collector',
      collectorHost,
      channel: opt.channel,
      generatedAtUtc: new Date().toISOString(),
      eventCount: kept.length,
      events: kept,
    }));
    if (readFrom && readFrom !== bookmarkFile) writeAtomic(bookmarkFile, fs.readFileSync(readFrom, 'utf8'));
    for (const p of pending) { try { fs.unlinkSync(p); } catch { /* none */ } }

    const summary = { fetched, added, skippedMachineAccountNoise: skippedNoise, pruned, eventCount: kept.length,
      backlogPossible: fetched >= opt.maxPerRun, durationMs: Date.now() - started };
    writeStatus('success', summary);
    log('INFO', `Run finished: ${JSON.stringify(summary)}`);
    if (!VERBOSE) console.log(`OK: +${added} new, ${kept.length} in file (${outFile})`);
    return 0;
  } catch (e) {
    log('ERROR', `Run FAILED: ${e.message}`);
    writeStatus('failure', { error: e.message });
    return 1;
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

if (require.main === module) {
  try { process.exitCode = main(); }
  catch (e) { console.error(`ERROR: ${e.message}`); process.exitCode = 1; }
}

module.exports = { parseEvents, toActivity, buildXPath, idRanges };
