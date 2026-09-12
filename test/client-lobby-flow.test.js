'use strict';

// The waiting-for-the-match screen is a recurring bug class: #room-info is a
// SIBLING of the create/join panes (deliberately, so it survives pane changes),
// which means revealing it does NOT hide them. Miss that and the join form —
// heading, room-code box, Join room button — stacks on top of the room you just
// created (this shipped once).
//
// There is no DOM library in this project (zero dependencies), so these guard
// the SOURCE: every reveal of #room-info must go through showWaitingView(), and
// that helper must put both panes down.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const PUB = path.join(__dirname, '..', 'public');
const APP = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

function count(hay, needle) {
  return hay.split(needle).length - 1;
}

test('every #room-info reveal goes through showWaitingView()', () => {
  const raw = count(APP, "$('room-info').classList.remove('hidden')");
  assert.strictEqual(
    raw,
    1,
    `#room-info is revealed directly ${raw} time(s). Route it through ` +
      'showWaitingView() instead, or the create/join panes stay up underneath it.'
  );
  const helper = APP.slice(APP.indexOf('function showWaitingView()'));
  assert.match(helper.slice(0, 400), /\$\('room-info'\)\.classList\.remove\('hidden'\)/,
    'showWaitingView() must be the one place that reveals #room-info');
});

test('showWaitingView() puts both panes down and is used by every reveal path', () => {
  const body = APP.slice(APP.indexOf('function showWaitingView()')).slice(0, 400);
  assert.match(body, /\$\('create-pane'\)\.classList\.add\('hidden'\)/, 'must hide the create pane');
  assert.match(body, /\$\('join-pane'\)\.classList\.add\('hidden'\)/, 'must hide the join pane');

  const calls = count(APP, 'showWaitingView();');
  assert.ok(calls >= 3,
    `expected the create, join and rejoin paths to call showWaitingView(); found ${calls}`);
});

test('the dead "Join a room instead" button is gone, and the join flow is still reachable', () => {
  assert.strictEqual(count(HTML, 'btn-go-join-2'), 0, 'the dead bottom button is back');
  assert.strictEqual(count(APP, 'btn-go-join-2'), 0, 'a handler for the dead button is back');
  // Removing it must not strand the join flow.
  assert.ok(count(HTML, 'id="btn-go-join"') >= 1, 'the working join entry is missing');
  assert.ok(count(HTML, "id=\"back-to-create\"") >= 1, 'back-to-create is missing');
});
