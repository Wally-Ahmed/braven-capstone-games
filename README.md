# braven-capstone-games

Braven Capstone: cyber-safety sample games (interactive, same-screen multiplayer, educational) with **Shield**, a scripted agent assistant that steps in before a mistake. Fictional company "Northbridge Co." only. Build spec: [SPEC.md](SPEC.md).

| Game | Path | Players | Status |
|---|---|---|---|
| Inbox Showdown (phishing + social engineering) | `games/inbox-showdown/` | 2 to 6 teams | built (Goal A) |

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
- Both also check the section 3 rules: zero console errors, no requests outside the site, no horizontal scroll at 375x667 and 360x640, buttons at least 44 px.

## Layout

```
index.html                         game selection hub (GAMES array: one entry per game)
shared/menu.js, shared/menu.css    shared top bar + menu, loaded by every game
games/inbox-showdown/index.html    Game A, self-contained
tests/                             Playwright checks
Dockerfile, deploy/nginx.conf      nginx:alpine static site on port 8080
fly.toml, .dockerignore            Fly.io config (not deployed yet)
```

To add a game: put it at `games/<slug>/index.html`, include `<link rel="stylesheet" href="/shared/menu.css">` and `<script src="/shared/menu.js" defer></script>`, call `Menu.init({ name, restart, setShield, howTo, shield })` on `DOMContentLoaded`, and add one entry to `GAMES` in `index.html`.

## Deploy (later, not done yet)

Wally runs `fly auth login` himself, then `fly launch --no-deploy --name braven-capstone-games --copy-config` and `fly deploy`. The repo stays private and GitHub Pages stays off.
