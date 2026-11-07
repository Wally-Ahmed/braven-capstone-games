# braven-capstone-games

Braven Capstone: cyber-safety sample games (interactive, same-screen multiplayer, educational) with **Shield**, a scripted agent assistant that steps in before a mistake. Fictional company "Northbridge Co." only. Build spec: [SPEC.md](SPEC.md).

| Game | Path | Players | Status |
|---|---|---|---|
| Inbox Showdown (phishing + social engineering) | `games/inbox-showdown/` | 2 to 6 teams | built (Goal A) |
| First Week Hunt (passwords/MFA, device hygiene, oversharing): hot-seat hunt for 8 hidden risks in the Northbridge office | `games/first-week-hunt/` | 2 to 6 players | built (Goal B) |

## Open the hub locally

From the repo root:

```sh
python3 -m http.server 8080
```

then open <http://localhost:8080/>. Pick a game card and press **Play**. Every game has a **Menu** button (top right) with Game selection, Restart, Shield on/off and How to play.

Use the local server rather than double-clicking `index.html`: the games load the shared menu from `/shared/menu.js`, an absolute path that only resolves over http. (The hub itself does open straight from the file, but its Play links then land on a game without its menu.)

### URL options (Inbox Showdown)

- `?shield=off|nudge|coach` sets the Shield assistant (default `nudge`). `coach` also gives a personalised tip on categories a team has already missed. Play a match with `off` and one with `nudge` to get a before/after error count; the menu toggle does the same.
- `?seed=<number>` makes the message order repeatable.

### How to play First Week Hunt

Enter 2 to 6 player names and press **Start hunt**. The office grid hides 8 risks (password sticky note, unlocked laptop, lobby USB stick, QR flyer, tailgater, oversharing phone post, ignored update banner, an MFA prompt you did not start) among safe look-alikes. On your turn tap a spot: a real risk scores +150 and you keep the turn; a decoy passes the turn; two decoys in a row and you got hacked, your score resets to 0. Each player gets one **Shield hint** (-50) that highlights a hidden risk, and Shield warns you after a first wrong tap. Every tap shows a one-line lesson. The hunt ends when all 8 are found or the 120 s clock runs out (it pauses while a lesson is open), then the leaderboard and Shield's per-player debrief.

### URL options (First Week Hunt)

- `?shield=off|nudge|coach` as above (off: no hints, no warnings).
- `?fast=1` sets the clock to 3 s for a quick demo or test.
- `?seed=<number>` makes the tile layout repeatable.

## Run the checks

Needs Node 18+ and Python 3.

```sh
npm install
npx playwright install chromium   # only if Playwright has no Chromium yet
npx playwright test
```

`playwright.config.js` starts `python3 -m http.server 8765` on 127.0.0.1 itself and stops it when the run ends. Specs:

- `tests/hub.spec.js` covers the hub and shared menu checklist (SPEC.md section 7).
- `tests/inbox-showdown.spec.js` covers the Game A checklist (section 6).
- `tests/first-week-hunt.spec.js` covers the Game B checklist (section 6), its hub card and the shared menu inside it.
- All of them also check the section 3 rules: zero console errors, no requests outside the site, no horizontal scroll at 375x667 and 360x640, buttons at least 44 px.

## Layout

```
index.html                         game selection hub (GAMES array: one entry per game)
shared/menu.js, shared/menu.css    shared top bar + menu, loaded by every game
games/inbox-showdown/index.html    Game A, self-contained
games/first-week-hunt/index.html   Game B, self-contained
tests/                             Playwright checks
Dockerfile, deploy/nginx.conf      nginx:alpine static site on port 8080
fly.toml, .dockerignore            Fly.io config (not deployed yet)
```

To add a game: put it at `games/<slug>/index.html`, include `<link rel="stylesheet" href="/shared/menu.css">` and `<script src="/shared/menu.js" defer></script>`, call `Menu.init({ name, restart, setShield, howTo, shield })` on `DOMContentLoaded`, and add one entry to `GAMES` in `index.html`.

## Deploy (later, not done yet)

Wally runs `fly auth login` himself, then `fly launch --no-deploy --name braven-capstone-games --copy-config` and `fly deploy`. The repo stays private and GitHub Pages stays off.
