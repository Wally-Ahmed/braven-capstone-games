# braven-capstone-games

Braven Capstone: cyber-safety sample games (interactive, same-screen multiplayer, educational) with **Shield**, a scripted agent assistant that steps in before a mistake. Fictional company "Northbridge Co." only. Build spec: [SPEC.md](SPEC.md).

| Game | Path | Players | Status |
|---|---|---|---|
| Inbox Showdown (phishing + social engineering) | `games/inbox-showdown/` | 2 to 6 teams | built (Goal A) |
| Phish or Fine? Buzzer Battle (mixed review, all 8 Shield categories): split-screen buzzer race to call each snippet phish or fine | `games/phish-or-fine/` | 2 to 6 players | built (Goal C) |

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

### How to play Phish or Fine? Buzzer Battle

- Enter 2 to 6 player names. 2 players play one 12-snippet heat; 3 to 6 play a bracket of 2-player heats (4 snippets each, winners advance, the odd player out gets a bye, n-1 heats in all). Every point counts on one leaderboard.
- Each heat starts with a 3-2-1 countdown. The left (laptop) or top (phone) zone buzzes with **A** = Phish, **S** = Fine; the right or bottom zone with **K** = Phish, **L** = Fine. Tapping the zone buttons works too.
- 6 seconds per snippet; if nobody buzzes it reveals and moves on. +100 for the first correct buzz, -50 for a wrong buzz (the other player may then answer for a +50 steal), and 3 correct in a row makes first-buzz points x1.5.
- Shield never interrupts the race: it explains every snippet at the reveal, gives coach tips between heats with `?shield=coach`, and ends with a debrief per player (categories they lost on, two weakest categories) plus a recap of the two most-missed red-flag kinds. "Copy results" gives the numbers for the deck.
- URL options: `?shield=off|nudge|coach` (off hides the lessons; the log still counts misses for a before/after comparison) and `?seed=<number>` for a repeatable deck.

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
- `tests/phish-or-fine.spec.js` covers the Game C checklist (section 6) plus its hub card and menu checks; timers run on Playwright's clock.
- Both also check the section 3 rules: zero console errors, no requests outside the site, no horizontal scroll at 375x667 and 360x640, buttons at least 44 px.

## Layout

```
index.html                         game selection hub (GAMES array: one entry per game)
shared/menu.js, shared/menu.css    shared top bar + menu, loaded by every game
games/inbox-showdown/index.html    Game A, self-contained
games/phish-or-fine/index.html     Game C, self-contained
tests/                             Playwright checks
Dockerfile, deploy/nginx.conf      nginx:alpine static site on port 8080
fly.toml, .dockerignore            Fly.io config (not deployed yet)
```

To add a game: put it at `games/<slug>/index.html`, include `<link rel="stylesheet" href="/shared/menu.css">` and `<script src="/shared/menu.js" defer></script>`, call `Menu.init({ name, restart, setShield, howTo, shield })` on `DOMContentLoaded`, and add one entry to `GAMES` in `index.html`.

## Deploy (later, not done yet)

Wally runs `fly auth login` himself, then `fly launch --no-deploy --name braven-capstone-games --copy-config` and `fly deploy`. The repo stays private and GitHub Pages stays off.
