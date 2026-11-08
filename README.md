# braven-capstone-games

Braven Capstone: cyber-safety sample games (interactive, same-screen multiplayer, educational) with **Shield**, a scripted agent assistant that steps in before a mistake. Fictional company "Northbridge Co." only. Build spec: [SPEC.md](SPEC.md).

| Game | Path | Players | Status |
|---|---|---|---|
| Inbox Showdown (phishing + social engineering) | `games/inbox-showdown/` | 2 to 6 teams | built (Goal A) |
| First Week Hunt (passwords/MFA, device hygiene, oversharing): hot-seat hunt for 8 hidden risks in the Northbridge office | `games/first-week-hunt/` | 2 to 6 players | built (Goal B) |
| Phish or Fine? Buzzer Battle (mixed review, all 8 Shield categories): split-screen buzzer race to call each snippet phish or fine | `games/phish-or-fine/` | 2 to 6 players | built (Goal C) |

## Open the hub locally

From the repo root:

```sh
python3 -m http.server 8080
```

then open <http://localhost:8080/>. Pick a game card and press **Play**, or **Watch the 30-second tutorial** first. Every game has a **Menu** button (top right) with Game selection, Restart, Shield on/off and How to play, plus a 🔊/🔇 sound button next to it.

## Tutorial, sound and mute (v4)

- **How to play overlay** (`shared/tutorial.js` + `shared/tutorial.css`): every game opens on a full-screen tutorial: a narrated story intro (step 0: Northbridge, a new hire's first week, Shield the sidekick, what you are about to do), a "What is this game?" step (premise, players, rounds, how you win, length), then 4 or 5 illustrated how-to steps (big animated emoji, one-sentence captions that are always on screen, progress dots, Back/Next, a big **Skip tutorial** button). Tick **Skip the tutorial next time** to stop it opening for that game (stored per game in `localStorage` as `nb-tutorial-skip:<slug>`). Re-open it any time from **Menu > How to play > Watch the tutorial**, from the **How to play** button on each setup screen, or with `?tutorial=1` (the hub's tutorial links use this). `?tutorial=0` never opens it. Keyboard: Left/Right arrows step, Esc skips, Tab stays inside.
- **Narration:** each step is read aloud by a warm coach voice. The steps live in `shared/narration/<slug>/script.json`. When a step lists an `"audio"` MP3 the overlay plays that file; otherwise it uses the browser's built-in speech synthesis to read the same caption. If the browser blocks autoplay, a **Tap to hear the coach** button appears (no errors), and every Next press narrates normally.
- **ElevenLabs:** `tools/generate-narration.sh` turns each script line into `shared/narration/<slug>/step<N>.mp3` with the ElevenLabs API (voice `DbwWo4rVEd5NrejHYUnm`, model `eleven_multilingual_v2`, the same as Wally's walkthrough tooling) and only then adds `"audio"` to that step. Run it with `ENV_FILE=/path/to/env-with-ELEVENLABS_API_KEY tools/generate-narration.sh` (default `./.env`, gitignored); the key is only read inside that shell. Steps can carry an `id` (the intro is `step0`, the premise step `about`); files are named after it, and steps that already have their MP3 are skipped unless `FORCE=1`. **Status 11/7:** all 20 steps have ElevenLabs MP3s (14 how-to steps, plus 3 intros and 3 premise steps generated at 7:27 PM); speech synthesis remains the fallback.
- **Sound effects** (`shared/audio.js`): synthesized with WebAudio (no files): tap, correct, wrong, Shield warning, countdown tick, go and a win fanfare. One global mute (`localStorage` `nb-muted`) covers sound effects and narration; toggle it with the 🔊 button in the top bar or **Voice on/off** in the tutorial.
- **Look and feel** (`shared/theme.css`, `shared/fx.js`): bright gradient theme with pink, sunshine, aqua, lime and violet accents, rounded cards, bigger type, screen fades, a green pulse and confetti burst on a right answer, a red shake on a wrong one, an amber glow on Shield warnings, animated 3-2-1 and last-seconds ticks, and a winner banner on the results screen. Motion is skipped for players who prefer reduced motion.
- **Easier to follow:** every setup screen has a one-line goal, colored quick-rule chips and a How to play button; the first move of a match is highlighted with a pulsing hint; and a "What just happened" line explains each move's result.

## In-game narration, full page and team picker (v5, his 11/7 7:33 to 7:55 PM asks)

- **Everything you have to read is narrated** (`shared/narrate.js`): setup intros, each message, office spot and snippet as it appears, turn prompts ("Red Team, your turn"), Shield's hints, warnings and coach tips, results with Shield's lesson, leaderboards and debriefs, and on the hub each card's pitch when it is tapped or one of its buttons gets keyboard focus. One queue, so nothing overlaps; a warning or a result interrupts what is playing; a block that leaves the screen stops.
- **Intuitive cues:** the block being read gets a yellow outline and a pulsing 🔊 badge, and every narrated block has a **🔁 Replay** button (44 px, keyboard reachable) that reads it again from the start. If the browser blocks sound before the first tap, the Replay button pulses and the first tap anywhere starts the reading. The 🔊 mute in the top bar silences narration too; pressing Replay while muted turns sound back on.
- **Lines:** each page builds its lines in `narrationLines()` from the same data it shows. `node tools/extract-lines.js` writes them to `shared/narration/<slug>/lines.json` (hub, inbox-showdown, first-week-hunt, phish-or-fine); a line whose text changes loses its MP3 so it can be re-voiced. Pages mark blocks with `data-narrate="id1 id2 _"` (line ids) plus `data-narrate-say` for names and scores, which the browser voice reads.
- **Voices:** `tools/generate-narration.sh` (same ElevenLabs voice and model as the tutorial) voices `lines.json` into `lines/<id>.mp3` in priority order (1 prompts and items, 2 hints and lessons, 3 tips and habits) under `MAX_CHARS` (default 14800) and sets `"audio": true` per line. **Status 11/7:** 163 of 274 lines are ElevenLabs MP3s (every priority-1 line in all four pages, all Inbox Showdown hints and lessons, 10 of 16 First Week Hunt lessons, 1 of 24 Phish or Fine lessons); the other 111 (category tips, "safe habit" lines, most Phish or Fine and some First Week Hunt lessons) use the browser voice until more credits are spent: `ENV_FILE=~/.accountability-secrets.env STEPS=0 MAX_CHARS=8000 tools/generate-narration.sh`.
- **Full page:** every page fills the viewport (`100dvh`, `100vh` fallback); the page never scrolls, the body scrolls inside if a screen is taller; type scales up on big screens; phones get safe-area padding (`viewport-fit=cover`). Start asks the browser for fullscreen on that first tap (ignored where unsupported, such as iPhone Safari), and **Menu > Fullscreen** turns it on or off and shows the real state.
- **Team / player picker** (`shared/roster.js`): no text box. Pick 2 to 6 with the −/+ buttons or the number chips; each team is a card with a default name, a tappable emoji avatar (each tap moves to the next free icon and colour) and tap-to-rename inline (Enter or ✓ to finish). Duplicate names are refused at Start.
- **Relative paths:** the games load `../../shared/...` and the shared scripts work out the site root from their own URL, so the site runs at a domain root (`python3 -m http.server`) and under a project path such as GitHub Pages' `/braven-capstone-games/` (checked by `tests/subpath.spec.js`).

Use the local server rather than double-clicking `index.html`: the narration manifests and tutorial scripts are fetched over http.

### URL options (Inbox Showdown)

- `?shield=off|nudge|coach` sets the Shield assistant (default `nudge`). `coach` also gives a personalised tip on categories a team has already missed. Play a match with `off` and one with `nudge` to get a before/after error count; the menu toggle does the same.
- `?seed=<number>` makes the message order repeatable.

### How to play First Week Hunt

Enter 2 to 6 player names and press **Start hunt**. The office grid hides 8 risks (password sticky note, unlocked laptop, lobby USB stick, QR flyer, tailgater, oversharing phone post, ignored update banner, an MFA prompt you did not start) among safe look-alikes. On your turn tap a spot: a real risk scores +150 and you keep the turn; a decoy passes the turn; two decoys in a row and you got hacked, your score resets to 0. Each player gets one **Shield hint** (-50) that highlights a hidden risk, and Shield warns you after a first wrong tap. Every tap shows a one-line lesson. The hunt ends when all 8 are found or the 120 s clock runs out (it pauses while a lesson is open), then the leaderboard and Shield's per-player debrief.

### URL options (First Week Hunt)

- `?shield=off|nudge|coach` as above (off: no hints, no warnings).
- `?fast=1` sets the clock to 3 s for a quick demo or test.
- `?seed=<number>` makes the tile layout repeatable.
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
- `tests/first-week-hunt.spec.js` covers the Game B checklist (section 6), its hub card and the shared menu inside it.
- All of them also check the section 3 rules: zero console errors, no requests outside the site, no horizontal scroll at 375x667 and 360x640, buttons at least 44 px.
- `tests/phish-or-fine.spec.js` covers the Game C checklist (section 6) plus its hub card and menu checks; timers run on Playwright's clock.
- `tests/tutorial.spec.js` covers the v4 tutorial for all three games (shows on first load, captions and dots, Next/Back, narration through the speech fallback, mute, Skip, "skip next time" persisting, Menu > How to play, keyboard, 360 px), a broken-MP3 fallback, the hub's tutorial links, the top-bar sound toggle and the goal / first-move / "What just happened" lines. `tests/tutorial-autoplay.spec.js` reruns the tutorial with Chromium's autoplay policy set to require a gesture and checks for zero console errors.
- The other specs start with every tutorial skipped (`storageState` in `playwright.config.js`), so they test the games themselves.
- Both also check the section 3 rules: zero console errors, no requests outside the site, no horizontal scroll at 375x667 and 360x640, buttons at least 44 px.

## Layout

```
index.html                         game selection hub (GAMES array: one entry per game)
shared/menu.js, shared/menu.css    shared top bar + menu (with the sound toggle), loaded by every game
shared/tutorial.js, tutorial.css   How to play overlay with narration
shared/audio.js                    WebAudio sound effects + the global mute
shared/fx.js, shared/theme.css     confetti/pop/shake effects and the colorful theme
shared/narration/<slug>/           script.json (tutorial) + lines.json and lines/<id>.mp3 (in-game narration); hub/ for the hub
shared/narrate.js                  in-game narration queue, 🔊 indicator and Replay buttons
shared/roster.js                   setup screen team / player picker
tools/extract-lines.js             writes lines.json from each page's narrationLines()
tools/generate-narration.sh        ElevenLabs MP3 generator for the tutorial steps and lines.json
games/inbox-showdown/index.html    Game A, self-contained
games/first-week-hunt/index.html   Game B, self-contained
games/phish-or-fine/index.html     Game C, self-contained
tests/                             Playwright checks
Dockerfile, deploy/nginx.conf      nginx:alpine static site on port 8080
fly.toml, .dockerignore            Fly.io config (kept, no longer the deploy target)
```

To add a game: put it at `games/<slug>/index.html`, include `../../shared/menu.css`, then after its own `<style>` `../../shared/theme.css` and `../../shared/tutorial.css`, the scripts `audio.js`, `fx.js`, `menu.js`, `tutorial.js`, `narrate.js` from `../../shared/` (all `defer`, in that order) and `../../shared/roster.js` without `defer`. On `DOMContentLoaded` call `Menu.init({ name, restart, setShield, howTo, shield })`, `Tutorial.init({ slug, name })` and `Narrate.init({ slug })`; expose `narrationLines()` on the page's test hook and add it to `tools/extract-lines.js`; write `shared/narration/<slug>/script.json`, and add one entry (with a `goal`) to `GAMES` in `index.html`.

## Deploy (later, not done yet)

The planned target is GitHub Pages as a project site, https://wally-ahmed.github.io/braven-capstone-games/ (all paths are relative, so it works under that sub-path). Turning Pages on is Wally's call. The Fly files stay in the repo but are no longer the target.
