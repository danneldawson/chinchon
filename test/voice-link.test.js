'use strict';

// Nov 3, 2026 (Dannel): voice-call link for a room. Engine slice: the validator (https only, allow-listed call services, max 300 chars).

const test = require('node:test');
const assert = require('node:assert');
const { validateVoiceLink, VOICE_LINK_MAX } = require('../src/voice-link');

const WA = 'https://call.whatsapp.com/voice/AbCdEf123';

test('validator: https links to the allowed call services only', () => {
  assert.deepStrictEqual(validateVoiceLink(WA), { url: WA, host: 'call.whatsapp.com' });
  assert.strictEqual(validateVoiceLink('  https://chat.whatsapp.com/Xyz ').host, 'chat.whatsapp.com');
  assert.strictEqual(validateVoiceLink('https://facetime.apple.com/join#v=1&p=abc').host, 'facetime.apple.com');
  assert.deepStrictEqual(validateVoiceLink(''), { url: null, host: null }, 'empty clears');
  for (const bad of ['http://call.whatsapp.com/voice/x', 'javascript:alert(1)', 'https://evil.example/x',
    'https://call.whatsapp.com.evil.example/x', 'https://user:pw@call.whatsapp.com/x', 'https://call.whatsapp.com:8443/x',
    'call.whatsapp.com/voice/x', 'https://call.whatsapp.com/a b', 42]) {
    assert.ok(validateVoiceLink(bad).error, `refused: ${bad}`);
  }
  assert.ok(validateVoiceLink(`https://call.whatsapp.com/${'a'.repeat(VOICE_LINK_MAX)}`).error, 'too long');
});
