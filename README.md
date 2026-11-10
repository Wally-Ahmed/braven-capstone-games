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
npm install        # once: Playwright and the ws package for the room server
npm run serve      # node server/index.js: the site + room mode on http://127.0.0.1:8080
```

then open <http://localhost:8080/>. Pick a game card and press **Play**, or **Watch the 30-second tutorial** first. Every game has a **Menu** button (top right) with Game selection, Restart, Shield on/off and How to play, plus a 🔊/🔇 sound button next to it. `npm run serve:static` (`python3 -m http.server 8080`) still serves the single-screen version, the same as GitHub Pages.

## Room mode: play on phones (v6, his 11/7 8:12 PM ask)

"Can we add server logic so each screen knows who's playing" / "You could host a server locally" / "This is only a demo anyways".

- **Run it:** `npm run serve` (or `PORT=8080 PUBLIC_ORIGIN=https://<tunnel>.trycloudflare.com node server/index.js`). One small Node process serves the static site and a WebSocket room relay at `/ws` on the same port; health at `/healthz`. Rooms live in memory only (no persistence) and expire after 2 hours idle; it logs to stdout. `PUBLIC_ORIGIN` makes the join link and QR point at the public tunnel even when the big screen is opened on `localhost`.
- **Host (big screen):** on the setup screen press **📱 Play on phones** next to the usual Start. The lobby shows a 4-letter room code, a QR code (generated in the page, no library or network) and the link `<site>/games/<slug>/?room=CODE`, plus every phone that has joined (name and icon). **Start with N phones** (2 to 6) begins the match with those names; the big screen then shows the board, leaderboard, Shield and narration as usual, with a 📱 Room badge (tap it for the code again). **Cancel** goes back to one screen. Play again returns to the lobby with the same phones.
- **Phones:** open the link or scan the QR, type a name, pick an icon, **Join**. Each phone shows its own name, icon and score, a big "Your turn" / "Wait" status, a short echo of the current message or prompt, Shield's warning when it is for that player, and only its own controls: Ready / Open / Report / Ask Shield / Back out / Open anyway / Challenge (Inbox Showdown), the office spots and the Shield hint (First Week Hunt), Start heat and the 🎣 Phish / ✅ Fine buzzers (Phish or Fine). Phones that join after the start watch.
- **How it works:** the host is authoritative. A phone sends a move; the server relays it to the host; the host accepts it only if that exact button is on that player's current view, then runs it through the game's own `dispatch(move)`; after every dispatch it sends each phone its view (`roomView(seat)` in each game). Phones reconnect by player id; if the big screen drops, phones show a notice until it reconnects. Without the server (GitHub Pages, `python3 -m http.server`) the button is simply not shown: the page sends one `HEAD` request for the site root and only `server/index.js` answers with `X-Rooms: 1`.
- **Protocol** (JSON over `/ws`): `create` / `created {code, hostKey}`, `resume`, `join {code, name, avatar, playerId?}` / `welcome {playerId, seat}`, `players` (to the host), `move` (phone to host), `state {for?, view}` (host to one phone or all), `lock` / `unlock` (seating), `close`, `host-left` / `host-back`, `error`. Full list at the top of `server/index.js`.

## Multi-screen lobby and one narration voice (v7, 11/10)

Wally 11/10: "all games rely on a single screen but I want to have a multi screen experience with lobbys anyway can make it join" / "sometimes the system voice is played instead of elevenlabs".

- **Lobby on the hub:** when the page is served by `server/index.js`, the hub shows a **📱 Multi-screen** panel with **Join a game with a code**, and every game card gets **📺 Host multi-screen**, which opens that game with `?host=1` and goes straight to the room lobby (code, QR, link, and the short address `<site>/join/` + code). Phones open **`/join/`**, type the 4-letter code, a name and an icon, and land seated in the right game (`join/index.html` joins over `/ws`, learns the game from the room, and hands its player id to the game page). With 3 to 6 phones in Phish or Fine, the phones sitting out a heat **call each snippet from the crowd** (🤔 I say Phish / Fine; no points, a running tally on the phone, and a "👀 Crowd: 2 of 3 called it" line on the big screen's reveal), so nobody just waits. A wrong code says so. On a plain static host the panel and Host buttons stay hidden. The setup-screen button now reads "📱 Multi-screen: everyone on their own phone".
- **One voice:** narration is clips-only by default. Only the recorded ElevenLabs clips play; parts without a clip (team names, scores, the 111 lines not voiced yet) stay on screen silently instead of switching to the robotic browser voice. Clips are preloaded into memory after load (blob URLs, 3 at a time), a clip that fails is retried once and then skipped, never replaced by the system voice. The tutorial does the same. `?voice=mixed` brings back the browser-voice fallback.
- **Hardening:** if any one shared file fails to load (slow tunnel), every game still starts; `shared/roster.js` was the only one that took a game down and each game now carries an inline fallback. `tests/resilience.spec.js` blocks every shared file in turn.

## Shield Check (v7, 11/10)

`shield/` (linked from the hub's **Meet Shield** card) is the standalone agent-assistant prototype from SPEC section 4: paste a message (or tap one of five samples) and **Check with Shield** gives a traffic light (🟢 looks fine / 🟡 careful / 🔴 stop), the reasons with the matched words (look-alike sender or link, urgency, password or code ask, money or gift cards, short link, risky attachment, secrecy, sign-in approval you did not start) and a **Report to IT** button (demo: nothing is sent). Below it, **How Shield would work**: the four steps the games share, where a real model plugs in (`Shield.assess(text)`: rules here, a language model plus allowlists and threat feeds in a real version) and the guardrails. Rule-based, labelled a demo, nothing leaves the page. Checked by `tests/shield-check.spec.js`.

## Wrong answers and selections (v6, his 8:30 and 8:40 PM asks)

- **Full-screen wrong-answer moment** (`FX.wrongFull()` in `shared/fx.js`): on every wrong outcome (a wrong call in Inbox Showdown, a decoy tap in First Week Hunt, a wrong buzz in Phish or Fine) one of six animations plays at random, each with its own synthesized sound (`Sfx.wrongVariant`): red alarm flash with shake (buzzer), cracked glass (glass crack), ACCESS DENIED stamp (slam), hacker glitch with falling green characters (glitch burst), a bouncing 🚫 that bursts into particles (boing-pop) and a padlock snapping shut (lock click). About 1.4 s, never takes clicks, a tap dismisses it, reduced motion gets a still card plus the sound. In room mode the big screen plays it and the phone that got it wrong plays a lighter version.
- **Selection punch-in** (`FX.selectPunch(el, label)`): every choice (Open / Report / Ask Shield / Back out / Open anyway / Challenge / reveal, office spot taps and hints, buzzes by tap or key, team count chips and icons) zooms from where it was tapped to the centre with an overshoot and a flash in its colour, with a whoosh + thud (`Sfx.punch`), then shrinks back (0.7 s, never blocks input). The wrong-answer moment waits for it. Phones play a lighter one; the big screen punches the phone's choice in too.

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
- **Desktop = portrait phone:** wider than 600 px the page is a centred 430 px full-height column (rounded, soft backdrop) showing exactly the phone layout; menus, tutorial, effects and room screens stay inside it; Fullscreen keeps it portrait.
- **Team / player picker** (`shared/roster.js`): no text box. Pick 2 to 6 with the −/+ buttons or the number chips; each team is a card with a default name, a tappable emoji avatar (each tap moves to the next free icon and colour) and tap-to-rename inline (Enter or ✓ to finish). Duplicate names are refused at Start.
- **Relative paths:** the games load `../../shared/...` and the shared scripts work out the site root from their own URL, so the site runs at a domain root (`python3 -m http.server`) and under a project path such as GitHub Pages' `/braven-capstone-games/` (checked by `tests/subpath.spec.js`).

Use the local server rather than double-clicking `index.html`: the narration manifests and tutorial scripts are fetched over http.

### URL options (Inbox Showdown)

- `?shield=off|nudge|coach` sets the Shield assistant (default `nudge`). `coach` also gives a personalised tip on categories a team has already missed. Play a match with `off` and one with `nudge` to get a before/after error count; the menu toggle does the same.
- `?seed=<number>` makes the message order repeatable.

### How to play First Week Hunt

Enter 2 to 6 player names and press **Start hunt**. The office grid hides 8 risks (password sticky note, unlocked laptop, lobby USB stick, QR flyer, tailgater, oversharing phone post, ignored update banner, an MFA prompt you did not start) among safe look-alikes. On your turn tap a spot: a real risk scores +150 and you keep the turn; a decoy passes the turn; two decoys in a row and you got hacked, your score resets to 0. After a find, **Fix it!** asks what you do about it: pick the safe fix of three for +50 (optional; a wrong pick shows the right one), and a 🔥 banner cheers finds in a row. Each turn has a **20 s shot clock** (refills on a find, pauses during a lesson); when it runs out the turn passes. Each player gets one **Shield hint** (-50) that highlights a hidden risk, and Shield warns you after a first wrong tap. Every tap shows a one-line lesson. The hunt ends when all 8 are found or the 120 s clock runs out (it pauses while a lesson is open), then the leaderboard and Shield's per-player debrief.

### URL options (First Week Hunt)

- `?shield=off|nudge|coach` as above (off: no hints, no warnings).
- `?fast=1` sets the clock to 3 s for a quick demo or test.
- `?turnclock=0` turns the per-turn shot clock off (`?turnclock=30` sets it to 30 s).
- `?seed=<number>` makes the tile layout repeatable.
### How to play Phish or Fine? Buzzer Battle

- Enter 2 to 6 player names. 2 players play one 12-snippet heat; 3 to 6 play a bracket of 2-player heats (4 snippets each, winners advance, the odd player out gets a bye, n-1 heats in all). Every point counts on one leaderboard.
- Each heat starts with a 3-2-1 countdown. The left (laptop) or top (phone) zone buzzes with **A** = Phish, **S** = Fine; the right or bottom zone with **K** = Phish, **L** = Fine. Tapping the zone buttons works too.
- 6 seconds per snippet; if nobody buzzes it reveals and moves on. +100 for the first correct buzz, -50 for a wrong buzz (the other player may then answer for a +50 steal), and 3 correct in a row makes first-buzz points x1.5.
- Shield never interrupts the race: it explains every snippet at the reveal, gives coach tips between heats with `?shield=coach`, and ends with a debrief per player (categories they lost on, two weakest categories) plus a recap of the two most-missed red-flag kinds. "Copy results" gives the numbers for the deck.
- URL options: `?shield=off|nudge|coach` (off hides the lessons; the log still counts misses for a before/after comparison) and `?seed=<number>` for a repeatable deck.

## Run the checks

Needs Node 18+ and Python 3 (the single-screen specs run against `python3 -m http.server`; `tests/rooms.spec.js` starts `server/index.js` on a free port itself).

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
- `tests/rooms.spec.js` covers room mode: `/healthz`, static serving (index, HEAD, directory redirect, 404, no path traversal, no `node_modules`), the button hidden on a plain static server, and for each game a host plus two 360 px phones in separate browser contexts (join by URL, the host lists them, phone moves change host state, host state reaches the phones, turn/wait per phone, a late joiner spectates, punch-in and wrong-answer effects on host and phone).
- `tests/resilience.spec.js` checks the clips-only voice policy, clip preloading, `?voice=mixed`, and that each game stays playable with any one shared file blocked. `tests/rooms.spec.js` also runs the hub lobby: Host multi-screen, two phones joining by code at `/join/`, a full Phish or Fine heat played from the phones, and the wrong-code error.
- `tests/wrong-fx.spec.js` forces each of the 6 wrong-answer variants (`Fx.wrongFull({variant: i})`) and checks it appears and clears, at 360 px, never blocks clicks, honours reduced motion and fires in each game; plus the selection punch-in.
- The other specs start with every tutorial skipped (`storageState` in `playwright.config.js`), so they test the games themselves.
- Both also check the section 3 rules: zero console errors, no requests outside the site, no horizontal scroll at 375x667 and 360x640, buttons at least 44 px.

## Layout

```
index.html                         game selection hub (GAMES array: one entry per game) + multi-screen panel
join/index.html                    join a multi-screen room by its 4-letter code
shield/index.html                  Shield Check: paste a message, get a traffic light + reasons; the Shield plan
shared/menu.js, shared/menu.css    shared top bar + menu (with the sound toggle), loaded by every game
shared/tutorial.js, tutorial.css   How to play overlay with narration
shared/audio.js                    WebAudio sound effects + the global mute
shared/fx.js, shared/theme.css     confetti/pop/shake effects and the colorful theme
shared/narration/<slug>/           script.json (tutorial) + lines.json and lines/<id>.mp3 (in-game narration); hub/ for the hub
shared/narrate.js                  in-game narration queue, 🔊 indicator and Replay buttons
shared/roster.js                   setup screen team / player picker
shared/net.js                      room mode client: host lobby + QR, phone player view, move checks
server/index.js                    Node server: static site + WebSocket room relay at /ws, /healthz
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
