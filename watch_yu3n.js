const { execSync } = require('child_process');
const HOST = 'https://chinchon-production.up.railway.app';
const code = 'YU3N';
const mySeat = 'iuawq1q4';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function api(path, body) {
  const url = HOST + path;
  const args = body ? `-X POST -H "Content-Type: application/json" -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'` : '';
  const cmd = `curl -s -m 10 ${args} "${url}"`;
  try {
    const out = execSync(cmd, { encoding: 'utf8' });
    return JSON.parse(out || '{}');
  } catch (e) {
    return { error: e.message };
  }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  log('watch started (curl-based)');
  while (true) {
    try {
      const me = api(`/api/state?code=${code}&seat=${mySeat}`);
      if (me.gone) { log('room gone — stopping'); break; }
      if (me.gameOver) { log('GAMEOVER', JSON.stringify(me.scoreboard)); break; }
      if (me.phase === 'layoff') {
        if (me.isYourTurn) { const r = api('/api/layoff/auto', { code, seat: mySeat }); log('layoff auto', r.error || 'ok'); }
        await wait(700); continue;
      }
      if (!me.isYourTurn) { await wait(700); continue; }
      if (me.phase === 'draw') {
        const r = api('/api/draw', { code, seat: mySeat, from: 'stock' });
        log('draw', r.error || 'ok');
        await wait(250); continue;
      }
      if (me.phase === 'discard') {
        const o = me.closeOptions || [];
        if (o.length) {
          const r = api('/api/discard', { code, seat: mySeat, cardId: o[0].cardId, close: true, splitIdx: 0 });
          log('CLOSE', r.error || 'ok');
        } else {
          const c = me.yourHand[0];
          const r = api('/api/discard', { code, seat: mySeat, cardId: c.id });
          log('discard', c.id, r.error || 'ok');
        }
        await wait(250); continue;
      }
      await wait(700);
    } catch (e) {
      log('ERR', e.message);
      await wait(2000);
    }
  }
  log('watch ended');
})();
