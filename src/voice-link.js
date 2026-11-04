'use strict';

// Voice-call link for a room (Nov 3, 2026, Dannel). The host may paste one link
// in the waiting room; once the table launches every player sees a "Join voice
// call" button that opens it in a new tab. Kept generic (not named after any
// one app) but only https links to known call services are accepted, so a room
// can't be used to push an arbitrary site at the other players. The button
// shows the link's domain too.

const VOICE_LINK_MAX = 300;
const VOICE_LINK_HOSTS = ['call.whatsapp.com', 'chat.whatsapp.com', 'facetime.apple.com'];

// Returns { url, host } for a valid link, { url: null } for an empty one
// (clears the link), or { error } explaining why it was refused.
function validateVoiceLink(raw) {
  if (raw == null) return { url: null, host: null };
  if (typeof raw !== 'string') return { error: 'link must be text' };
  const text = raw.trim();
  if (!text) return { url: null, host: null };
  if (text.length > VOICE_LINK_MAX) return { error: `link too long (max ${VOICE_LINK_MAX} characters)` };
  if (/\s/.test(text)) return { error: 'link must not contain spaces' };
  let u;
  try { u = new URL(text); } catch { return { error: 'not a valid link' }; }
  if (u.protocol !== 'https:') return { error: 'only https links are allowed' };
  if (u.username || u.password) return { error: 'not a valid link' };
  if (u.port) return { error: 'not a valid link' };
  const host = u.hostname.toLowerCase();
  if (!VOICE_LINK_HOSTS.includes(host)) return { error: `only ${VOICE_LINK_HOSTS.join(', ')} links are allowed` };
  if (u.href.length > VOICE_LINK_MAX) return { error: `link too long (max ${VOICE_LINK_MAX} characters)` };
  return { url: u.href, host };
}

module.exports = { validateVoiceLink, VOICE_LINK_MAX, VOICE_LINK_HOSTS };
