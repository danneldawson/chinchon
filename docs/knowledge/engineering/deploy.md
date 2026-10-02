# Deploy: GitHub → Railway

- **Live URL:** https://chinchon-production.up.railway.app (Railway free tier).
- **Repo:** https://github.com/danneldawson/chinchon, branch `main`.
- **Every push to `main` auto-deploys,** usually within about 1–2 minutes, and the URL
  stays the same.

## 1. One-time setup (already done Aug 15; kept for reference or a rebuild)

Dannel wants **numbered click-paths with every form field explained**.

1. **GitHub → New repository.**
   - Name it `chinchon` and make it **Public**.
   - **Leave README, .gitignore and License OFF**, otherwise they create conflicting
     files.
2. **Local repo.**
   - Run `git init`.
   - `.gitignore` should exclude `node_modules`, logs, `.tunnel-url` and stray
     prototypes.
   - `package.json` needs `"start": "node server.js"` and
     `"engines": {"node": ">=18"}`.
3. **Push.**
   - Create a classic PAT with **only the `repo` scope**. Add `workflow` too if you
     push GitHub Actions files.
   - Push with:
     ```bash
     git remote add origin https://github.com/danneldawson/chinchon.git
     git push https://danneldawson:<PAT>@github.com/danneldawson/chinchon.git main
     git remote set-url origin https://github.com/danneldawson/chinchon.git   # strip the token immediately
     ```
   - Verify without a token (the web UI lags):
     `curl -s https://api.github.com/repos/danneldawson/chinchon/contents/server.js`.
4. **Railway.**
   - railway.app → **Login with GitHub** → New Project → **Deploy from GitHub repo** →
     `chinchon` → Deploy.
   - It detects Node and runs `npm install` + `npm start`.
5. **Optional extras.**
   - A custom domain costs about $2/yr (Porkbun or Namecheap → Railway Settings →
     Domains). It's cosmetic; the Railway subdomain is already always up. Deferred.
   - **"Make it an app":** on a phone, Share → **Add to Home Screen**. A proper PWA
     needs a `manifest.json` plus a tiny service worker, about 30 minutes of work.

**Before Railway (Aug 13):** cross-home play went through a `cloudflared` tunnel from
Dannel's Mac, which had to stay on. The share link had to use the tunnel URL. That's
history now.

## 2. Pushing changes

```bash
node --check server.js && node --check public/app.js && npm test   # 0 fail, ALWAYS first
git add -A && git commit -m "<what & why>"
git push origin main
```

**The current state is unresolved; check with Dannel.**
- On **Sep 14 at 19:10 PT** the push **failed**: GitHub rejected HTTPS password auth.
- The local commit `80bbfe7` ("feat: multi mode — no bots, requires 2+ humans") plus
  the partly applied Sep 14 UI edits were never pushed.
- The last commit known to be on `origin/main` is `8c1aab6` (Sep 13, 179 tests).

**Two ways to fix authentication:**
- **SSH (recommended, one-time setup):**
  1. `ssh-keygen -t ed25519 -C "danneldawson"`
  2. Add `~/.ssh/id_ed25519.pub` under GitHub → Settings → SSH and GPG keys.
  3. `git remote set-url origin git@github.com:danneldawson/chinchon.git`
  4. `git push`
- **A PAT** (`repo` scope) pasted at the password prompt, or the macOS keychain
  credential helper.

**Token hygiene.** Never leave a token in the remote URL, in a commit, or in a chat
message. Don't echo it into logs.

## 3. Verify a deploy (don't trust a 200)

1. **Poll for the redeploy.** The old bundle keeps being served for about 15–45s. Loop
   with `sleep 15` until a marker string from your change appears in the served asset.
2. **Prove the served bytes are your commit:**
   ```bash
   git show HEAD:public/app.js > /tmp/committed.js
   curl -s https://chinchon-production.up.railway.app/app.js -o /tmp/served.js
   shasum -a 256 /tmp/committed.js /tmp/served.js      # sha256sum on Linux
   ```
   `index.html` differs only in its `?v=` cache-bust parameter.
3. **Prove a new route exists** by comparing *bodies*, not status codes:
   - a registered route returns its own error (`{"error":"no such room"}`);
   - an unknown one returns `{"error":"unknown api route"}`.
4. **Check the live API shape** after any change to `serialize` or the scoreboard. The
   client and server can deploy out of step.
5. **If GitHub says "Everything up-to-date" and Railway doesn't redeploy,** force it:
   `git commit --allow-empty -m "force redeploy" && git push origin main`.
6. **Say which claims you verified over HTTP,** and which Dannel should check by eye on
   his phone.

## 4. Things that only break on the deployed host

- **Share and base URLs:** derive them from the request, never from `localhost:$PORT`.
  Railway listens on 8080 behind https.
  ```js
  function publicBase(req) {
    if (req && req.headers && req.headers.host) {
      const https = (req.socket && req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https';
      return `${https ? 'https' : 'http'}://${req.headers.host}`;
    }
    return `http://localhost:${process.env.PORT || 3000}`;
  }
  ```
- **Stale browser caches** were the #1 false "deploy failed" report.
  - Fix: `Cache-Control: no-cache, no-store, must-revalidate` (plus `Pragma` and
    `Expires`) on **all** static assets (`5fd037d`).
  - Also rewrite `index.html`'s `/app.js"` and `/style.css"` to `?v=<base36 mtime sum>`.
  - Verify with `curl -s -D - -o /dev/null <url>/app.js | grep -i cache-control`.
- **In-memory state is wiped** whenever the free instance sleeps, restarts or redeploys.
  - Symptoms: "Players here (0)", rooms gone, "no such room".
  - This is platform behaviour, not a code bug.
  - Mitigations:
    - the client self-heals by re-entering the lobby with the saved name (a one-shot
      `_healing` flag);
    - the client always boots to the landing screen;
    - after a 404 on room or seat, it bounces to the lobby or landing screen.
  - A redeploy in the middle of a family game kills that game, so avoid pushing while
    they're playing.
- **ASCII-only source strings** (CHINCHON without the accent), at Dannel's request, to
  avoid encoding problems.
- **`curl | python3`** trips some agent security scanners. Use plain `curl` and
  inspect the output.

## 5. Always-on (avoid the free-tier cold start)

- **Keep-awake ping:**
  ```yaml
  # .github/workflows/keep-awake.yml
  on: { schedule: [ { cron: '*/10 * * * *' } ], workflow_dispatch: {} }
  jobs: { ping: { runs-on: ubuntu-latest, steps: [ { run: 'curl -fsS -o /dev/null https://chinchon-production.up.railway.app/' } ] } }
  ```
  - **Gotcha:** pushing a workflow file is rejected unless the PAT has the `workflow`
    scope. That isn't a code bug. The alternative is UptimeRobot.
  - Whether this workflow is currently in the repo is unknown; check before assuming.
- Pings reduce cold starts but don't make in-memory rooms survive a redeploy or restart.
