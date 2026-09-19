# Status Check

**Cue:** say exactly **Status Check** (to Chinchón Forge or via Chief of Staff).

That refreshes the three hosting upgrade markers below and returns real numbers plus a plain-English read on whether anything is approaching upgrade territory. Do not invent usage — if a dashboard or login blocks a number, say so.

Standing skill: **Hosting upgrade status check**.

---

## 1. Railway (hobby credit)

**What we measure**

- Current / recent **concurrent visitors** (or the closest active-connections metric Railway shows)
- **Daily request count** (or closest HTTP volume metric)
- Remaining **hobby credit / plan allowance**
- Whether the public service is online

**Where**

- Project: `divine-fascination` / service `chinchon` on [railway.com](https://railway.com)
- Historical URL: `https://chinchon-production.up.railway.app` (may change after recreate)

**Last run**

| Metric | Value | Notes |
|--------|-------|-------|
| Concurrent visitors | _pending_ | Needs Railway dashboard login |
| Daily requests | _pending_ | Needs Railway dashboard login |
| Hobby credit / allowance | _pending_ | Needs Railway dashboard login |
| Service online / public URL | _pending_ | Old production URL returned Application not found (edge 404) as of 2026-09-19 |
| Upgrade risk (plain English) | _pending_ | |

---

## 2. GitHub LFS (`danneldawson/chinchon`)

**What we measure**

- **LFS storage used** vs **1 GB** cap
- **LFS bandwidth** used vs **monthly** bandwidth limit

**Where**

- GitHub → Settings → Billing / Git LFS (account or org), or `gh` if authenticated

**Last run**

| Metric | Value | Notes |
|--------|-------|-------|
| LFS storage used / 1 GB | _pending_ | Needs GitHub billing access |
| LFS bandwidth / monthly limit | _pending_ | Needs GitHub billing access |
| Upgrade risk (plain English) | _pending_ | |

---

## 3. GitHub Actions

**What we measure**

- **Actions minutes used** vs **monthly quota** (verify on billing page — do not assume the free-tier number)

**Where**

- GitHub → Settings → Billing → Actions

**Last run**

| Metric | Value | Notes |
|--------|-------|-------|
| Actions minutes used / monthly quota | _pending_ | Needs GitHub billing access |
| Upgrade risk (plain English) | _pending_ | |

---

## How to refresh

1. Say **Status Check** to Chinchón Forge.
2. Forge runs all three checks (skill: Hosting upgrade status check).
3. Numbers land in chat (and this file is updated when a run completes).

## Notes

- Read-only: Status Check never changes billing or upgrades a plan unless you explicitly ask.
- Local source of truth for the game remains `~/Desktop/chinchon` on Skinny Macintosh.
- Last doc scaffold: 2026-09-19 PT.
