'use strict';

// Visitor counter (Oct 29, 2026, Dannel: "go ahead with all your suggestions").
// Answers "how many real people came / played today, and how many are here
// right now?" without storing anything personal:
//   - a visitor is the SHA-256 of (secret salt + day + IP + user agent), cut to
//     16 hex chars. The day is in the hash, so one person cannot be followed
//     from one day to the next, and no IP or user agent is ever stored;
//   - once a day is over only its counts are kept (the hashes are dropped);
//   - obvious non-people are skipped: curl / Node / Python scripts, headless
//     browsers, crawlers, uptime and health checks, empty user agents, and the
//     two read-only status endpoints (/api/activity, /api/visitors) themselves.
// Days are counted in Dannel's time zone (America/Los_Angeles).
// Saved as plain JSON next to the rooms state file (atomic temp + rename).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TIME_ZONE = 'America/Los_Angeles';
const ACTIVE_MS = 5 * 60 * 1000;   // "here now" = any request in the last 5 minutes
const KEEP_DAYS = 90;              // daily counts kept this long
const FILE_VERSION = 1;

// User agents that are not a person in a browser.
const NOT_A_PERSON = /bot|crawl|spider|slurp|curl|wget|python|node|undici|axios|go-http|java\/|okhttp|libwww|httpie|postman|insomnia|headless|phantom|puppeteer|playwright|lighthouse|uptime|monitor|pingdom|statuscake|health|railway|check|facebookexternalhit|embedly/i;
// (Link previews from WhatsApp, Telegram, Slack… do not start with Mozilla/, so
// LOOKS_LIKE_BROWSER drops them; their in-app browsers DO count as people.)
// A real browser says Mozilla/… (every mainstream browser does).
const LOOKS_LIKE_BROWSER = /^Mozilla\//;
// Requests that never count, whoever makes them.
const SKIP_PATHS = new Set(['/api/activity', '/api/visitors', '/health', '/healthz', '/favicon.ico', '/robots.txt']);
// Requests that mean "this visitor actually played" (entered the lobby or a room).
const PLAY_PATHS = new Set(['/api/lobby/enter', '/api/room/new', '/api/room/join', '/api/room/rejoin', '/api/room/join-rematch']);

function dayOf(ms) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// Should this request count, and is it a visit (page load / API) at all?
function classify({ method, path: p, userAgent }) {
  if (SKIP_PATHS.has(p)) return 'skip';
  const isPage = method === 'GET' && (p === '/' || p === '/index.html');
  const isApi = p.startsWith('/api/');
  if (!isPage && !isApi) return 'skip'; // css, js, images: the page load already counted
  const ua = String(userAgent || '');
  if (!ua || !LOOKS_LIKE_BROWSER.test(ua) || NOT_A_PERSON.test(ua)) return 'excluded';
  return method === 'POST' && PLAY_PATHS.has(p) ? 'play' : 'visit';
}

// First address in X-Forwarded-For (Railway's proxy), else the socket's.
function clientIp(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

function createVisitorLog({ file = null, salt = null } = {}) {
  let data = { version: FILE_VERSION, salt: salt || crypto.randomBytes(16).toString('hex'), days: {} };
  const recent = new Map(); // hash -> last seen (today's hashes only; memory only)
  let dirty = false;

  function hashOf(day, ip, ua) {
    return crypto.createHash('sha256').update(`${data.salt}|${day}|${ip}|${ua}`).digest('hex').slice(0, 16);
  }

  // Close finished days: keep counts, drop hashes; forget days older than KEEP_DAYS.
  function roll(today) {
    for (const [day, d] of Object.entries(data.days)) {
      if (day !== today && (d.v || d.p)) {
        d.visitors = d.v ? d.v.length : (d.visitors || 0);
        d.players = d.p ? d.p.length : (d.players || 0);
        delete d.v; delete d.p;
        dirty = true;
      }
    }
    const keys = Object.keys(data.days).sort();
    while (keys.length > KEEP_DAYS) { delete data.days[keys.shift()]; dirty = true; }
  }

  function dayRec(day) {
    if (!data.days[day]) { data.days[day] = { v: [], p: [], excluded: 0 }; dirty = true; }
    const d = data.days[day];
    if (!d.v) { d.v = []; d.p = []; }
    return d;
  }

  // req-like: { method, path, userAgent, ip }
  function record(info, now = Date.now()) {
    const kind = classify(info);
    if (kind === 'skip') return kind;
    const today = dayOf(now);
    roll(today);
    const d = dayRec(today);
    if (kind === 'excluded') { d.excluded = (d.excluded || 0) + 1; dirty = true; return kind; }
    const h = hashOf(today, info.ip || '', String(info.userAgent || ''));
    if (!d.v.includes(h)) { d.v.push(h); dirty = true; }
    if (kind === 'play' && !d.p.includes(h)) { d.p.push(h); dirty = true; }
    recent.set(h, Math.max(now, recent.get(h) || 0));
    return kind;
  }

  function activeNow(now = Date.now()) {
    let n = 0;
    for (const [h, t] of recent) {
      if (now - t < ACTIVE_MS) n++;
      else recent.delete(h);
    }
    return n;
  }

  function summary(now = Date.now(), nDays = 14) {
    const today = dayOf(now);
    roll(today);
    const count = (day) => {
      const d = data.days[day] || {};
      return {
        date: day,
        visitors: d.v ? d.v.length : (d.visitors || 0),
        players: d.p ? d.p.length : (d.players || 0),
        excluded: d.excluded || 0,
      };
    };
    const n = Math.max(1, Math.min(KEEP_DAYS, Number(nDays) || 14));
    const days = Object.keys(data.days).sort().reverse().slice(0, n).map(count);
    return {
      timeZone: TIME_ZONE,
      today: count(today),
      activeNow: activeNow(now),
      activeWindowMinutes: ACTIVE_MS / 60000,
      days,
      note: 'visitors = distinct browsers that opened the game that day; players = those who entered the lobby or a room; excluded = requests from scripts, bots and health checks (not counted). No IPs or names are stored.',
      checkedAt: new Date(now).toISOString(),
    };
  }

  function save() {
    if (!file || !dirty) return false;
    const tmp = `${file}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
    dirty = false;
    return true;
  }
  function safeSave() {
    try { return save(); } catch (e) { console.error('visitors save failed:', e.message); return false; }
  }
  function load() {
    if (!file) return false;
    try {
      const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (snap && typeof snap === 'object' && typeof snap.salt === 'string' && snap.days && typeof snap.days === 'object') {
        data = { version: FILE_VERSION, salt: snap.salt, days: snap.days };
        return true;
      }
    } catch { /* missing or corrupt: start fresh */ }
    return false;
  }

  return { record, summary, activeNow, save: safeSave, load, get file() { return file; }, _data: () => data };
}

// visitors.json next to the rooms file (or CHINCHON_VISITORS_FILE).
function defaultFile(env = process.env) {
  if (env.CHINCHON_VISITORS_FILE) return env.CHINCHON_VISITORS_FILE;
  if (env.CHINCHON_STATE_FILE) return path.join(path.dirname(env.CHINCHON_STATE_FILE), 'visitors.json');
  return null;
}

module.exports = { createVisitorLog, classify, clientIp, dayOf, defaultFile, ACTIVE_MS, TIME_ZONE };
