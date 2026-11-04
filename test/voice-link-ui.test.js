'use strict';

// Nov 3, 2026 (Dannel): voice-call link for a room. UI slice: waiting-room field and the in-game Join voice call button.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

test('client: generic labels in both languages; the in-game button opens a new tab and hides with no link', () => {
  const APP = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(APP, /voiceLinkLabel: 'Voice chat link \(optional\)'/);
  assert.match(APP, /voiceLinkLabel: 'Enlace de llamada \(opcional\)'/);
  assert.match(APP, /joinVoiceCall: 'Join voice call'/);
  assert.match(APP, /joinVoiceCall: 'Unirse a la llamada'/);
  assert.match(HTML, /<a id="btn-voice-call" class="voice-call hidden" target="_blank" rel="noopener noreferrer"><\/a>/);
  assert.match(HTML, /id="voice-link-input" type="url"[^>]*maxlength="300"/);
  assert.ok(!/whatsapp/i.test(HTML) && !/whatsapp/i.test(APP), 'not named after one app (the allow-list lives on the server)');
  const src = APP.slice(APP.indexOf('function renderVoiceCall('), APP.indexOf('function renderVoiceLinkRow('));
  assert.match(src, /classList\.toggle\('hidden', !has\)/);
});
