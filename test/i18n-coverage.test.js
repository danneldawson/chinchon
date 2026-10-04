// Every translation key the UI uses must have an English AND a Spanish value,
// so Spanish mode never silently falls back to English (or to blank).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const js = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');

// Evaluate just the I18N object literal (it has no dependencies).
const start = js.indexOf('const I18N = {');
const end = js.indexOf('\n};', start);
const I18N = new Function(`${js.slice(start, end + 3)}\nreturn I18N;`)();

// Known gaps, deliberately left open (adding them would change English labels).
const OPEN = {
  en: new Set(['rules', 'shareWhatsApp']),
  es: new Set(['shareWhatsApp']),
};

function usedKeys() {
  const keys = new Set();
  for (const m of js.matchAll(/(?<![\w.$])t\('(\w+)'\)/g)) keys.add(m[1]);
  for (const m of html.matchAll(/data-i18n(?:-placeholder|-title)?="(\w+)"/g)) keys.add(m[1]);
  return keys;
}

test('every used translation key has an English and a Spanish value', () => {
  const missing = [];
  for (const key of usedKeys()) {
    for (const lang of ['en', 'es']) {
      if (OPEN[lang].has(key)) continue;
      if (typeof I18N[lang][key] !== 'string' || !I18N[lang][key]) missing.push(`${lang}.${key}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});

test('Spanish values for the lobby flow are really Spanish', () => {
  const es = I18N.es;
  assert.strictEqual(es.rejoin, 'Reconectar');
  assert.strictEqual(es.roomCodeLabel, 'Código de sala');
  assert.strictEqual(es.rulesTitle, 'Cómo jugar');
  assert.strictEqual(es.leaveLobbyTitle, 'Salir del lobby');
  assert.strictEqual(es.rejoinFailed, 'Error al reconectar');
  // Spanish values identical to English must be words that really are the same
  // in both languages (no English left behind in the es table).
  const SAME_OK = new Set(['title', 'chinchon', 'lobbyTitle', 'tutorialTitle', 'privateDialogueNo', 'matchesCount']);
  const same = Object.keys(es).filter((k) => !k.endsWith('En') && I18N.en[k] === es[k] && !SAME_OK.has(k));
  assert.deepStrictEqual(same, []);
});

test('lobby elements are wired to translation keys (no hardcoded English)', () => {
  assert.match(html, /id="btn-rejoin"[^>]*data-i18n="rejoin"/);
  assert.match(html, /id="rejoin-code"[^>]*data-i18n-placeholder="roomCodeLabel"/);
  assert.match(html, /id="btn-rules-top"[^>]*data-i18n-title="rulesTitle"/);
  assert.match(html, /id="btn-leave-lobby"[^>]*data-i18n-title="leaveLobbyTitle"/);
  assert.match(js, /querySelectorAll\('\[data-i18n-title\]'\)/);
});
