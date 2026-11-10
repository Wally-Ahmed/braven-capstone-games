# Braven Capstone sample games: build spec

_Sat 11/7/2026, for Wally before the 8 PM Zoom with Rose. Per his 5:05 PM brief: interactive, multiplayer, educational cyber-safety games plus an agent assistant that helps avoid human error. Spec only._

## 1. Capstone context

- **Partner:** Cognizant. **Challenge (Braven's wording):** "How might Cognizant reinvent cybersecurity awareness for a workforce that expects personalized, interactive, and on-demand learning?" (capstone-notes-page.html, A.2)
- **User group:** non-technical employees, especially young professionals and new hires (Alaina: "18-29, some tech knowledge, new to Cognizant").
- **Problem (Wally, 11/6):** "cybersecurity safety is often overlooked in favor of comfort".
- **Selected idea:** the AI agent assistant (Wally, WhatsApp 11/6 5:22 AM), "an AI agent that is specifically assigned to like help this person", giving a new hire correct security info fast and checking a suspicious email or link before it is opened (Mike Cooley call, 11/5).
- **Other marked ideas:** Kahoot!, roleplay, scavenger hunt ("Go to the wrong area, and you say you got hacked. Start over!").
- **Roles:** Wally Coordinator, Rose (Rosmeiry) Prototyper, Alaina and Mohammad Researchers, Alejandro and Idalis Presentation Designers, Emmanuel Visual Editor. Prototype draft due before Lab 11, Wed 11/11.
- **"The game prototype":** only the class log's paraphrase of Rose's Fri 10:30 PM message ("help conceptualize the game prototype"). No file defines it or its link to the AI agent. **UNVERIFIED, ask Wally.** Every game below puts the agent inside.

## 2. Brainstorm (8 ideas)

1. **Inbox Showdown:** teams triage a shared inbox; the assistant warns before a risky click.
2. **First Week Hunt:** hot-seat scavenger hunt for hidden risks in an office; wrong taps get you "hacked".
3. **Phish or Fine? Buzzer Battle:** Kahoot-style buzzer race to call snippets safe or unsafe.
4. **The Pretexter:** one player reads a scripted scam-call card, the other must verify before giving info.
5. **Password Forge:** teams build passphrases, an attacker card tries to crack them, MFA as a power-up.
6. **Push Fatigue:** a flood of MFA prompts; approve only the real one while the assistant flags repeats.
7. **Overshare Detective:** spot what in a fake social post (badge, screen, travel dates) helps an attacker.
8. **Patch Race:** teams spend turns on updates, locks and backups before a breach card hits.

**Developed: 1, 2, 3.** Together they cover phishing, social engineering, passwords/MFA, oversharing and device hygiene, match the team's marked ideas (AI agent, scavenger hunt, Kahoot), and each fits one file. 4 and 5 suit live roleplay.

## 3. Shared rules for every game

One `index.html` per game, its own CSS/JS inline, plus the shared menu (section 7); no build step, backend, accounts, third-party requests or external assets. Works at 360 px wide. A full match is under 3 minutes. **Multiplayer is same-screen:** 2 to 6 named players or teams, pass-and-play, hot-seat or split-screen buzzers, on one screen or a Zoom share. Every game keeps per-player scores and ends on a leaderboard (`leaderboard`, sorted high to low). Fictional company ("Northbridge Co.") and senders only, never Cognizant's name or logo. Every control has a `data-testid`. All moves go through one `dispatch(move)` function that updates one `state` object (section 5). The assistant "Shield" is **scripted** and labelled "prototype, scripted agent". **Every game's checklist also includes:** zero console errors, no requests outside the site, no horizontal scroll at 375x667, buttons at least 44 px.

## 4. Agent assistant that helps avoid human error

**Behaviour.** The selected idea, in game: Shield steps in **before** a mistake.
1. **Nudge (before):** a risky action on a flagged item is paused: "Hold on, the sender is northbr1dge.co, not northbridge.co. Still open it?" Confirm or back out.
2. **Explain-why (after):** one line naming the red flag and the safe habit.
3. **Personalize:** tracks misses across 8 categories (urgency, look-alike domain, credential ask, gift card, attachment, MFA fatigue, oversharing, device hygiene) and nudges sooner where a player keeps missing.
4. **Debrief (end):** each player's two weakest categories with a tip, and "Shield stopped N mistakes".

**What it logs.** In-memory `shieldLog` per player: item, category, action, warned or not, backed out or not, seconds to decide. Debrief and leaderboard read it; nothing leaves the page. "Copy results" gives the team numbers for the deck.

**How it plugs in.** One inline object `Shield` with `beforeAction(player, action, item)` returning `{allow, warning}`, `afterAction(...)` returning a lesson, and `debrief(player)`. `?shield=off|nudge|coach` or the menu's Shield toggle sets it; a match off then on gives the deck a before/after error count.

**Per game.** A: nudge before a risky Open, explain after every reveal. B: hints, and a warning after the first decoy tap. C: no mid-race nudges, full debrief per player.

**Standalone prototype ("Shield Check", a later hub card).** The chat sidekick or browser extension an employee would have: paste a message (or click "Check with Shield") and get a traffic light (safe / careful / stop), the reasons (look-alike domain, urgency, credential or payment ask, short link, risky attachment) and "Report to IT". Rule-based in the prototype; a real model slots in at one point: `Shield.assess(text)` calls a language model (plus company allowlists and threat feeds) instead of the rules. Labelled a demo, not a security tool.

## 5. Real-time rooms (built 11/7, v6)

All play runs through `dispatch(move)` on one serializable `state`, so room mode only adds a transport. Built as a tiny WebSocket relay (`server/index.js`, Node + `ws`, same port as the static site, in memory, rooms expire after 2 h idle). The host screen creates a room (4-letter code + QR), phones join at `games/<slug>/?room=CODE` with a name and an icon and get a stable player id and seat; the host stays authoritative: phone moves are relayed to the host, checked against the buttons on that player's current view (`roomView(seat)` in each game), run through `dispatch`, and the host sends every phone its own view after each dispatch. Phones show only their status, prompt echo, Shield warning and controls; late joiners spectate; reconnect by player id; host disconnect is shown on the phones. Same-screen stays the default and the only mode on GitHub Pages or any plain static server (the button is hidden when the `HEAD` probe has no `X-Rooms: 1`).

## 6. The three games

### Game A: Inbox Showdown (phishing + social engineering)

**Concept.** Day one at Northbridge. 2 to 6 players or teams share one inbox on one device or a Zoom share. On its turn a team gets a message (email, SMS, chat, or a "call from IT") and picks **Open**, **Report** or **Ask Shield**. Other teams may **Challenge** for steal points, so everyone argues it out loud.
**Loop.** Message, decision, optional challenge, reveal + lesson, next team. 3 messages per team from a bank of 18 (10 risky, 8 legit).
**Screens.** Setup (2 to 6 names), "Pass to <team>", Turn card, Reveal, Leaderboard, Debrief.
**Scoring.** +100 correct, +60 correct after asking Shield, +50 steal on a correct challenge, -50 for opening a phish.
**Acceptance.**
- [ ] Setup accepts 2 to 6 names and rejects 1 or 7; turns rotate in order; each team gets 3 messages; a pass screen shows between turns.
- [ ] `btn-open`, `btn-report`, `btn-ask`, `btn-challenge` work; `btn-ask` shows `agent-hint` for every message.
- [ ] With `?shield=nudge`, opening a risky message first shows `shield-warning`; with `?shield=off` it does not.
- [ ] Scripted all-correct match gives each team 300; `leaderboard` lists every team sorted by score; `debrief` lists each team's weakest categories.
**Effort.** 2 to 3 agent hours.

### Game B: First Week Hunt (passwords/MFA, device hygiene, oversharing)

**Concept.** Alaina's scavenger hunt, hot-seat. An office scene (CSS grid) hides 8 risks: password sticky note, unlocked laptop, lobby USB stick, QR flyer, tailgater, oversharing phone post, ignored "update later" banner, an unrequested MFA prompt. 2 to 6 players take turns; a find keeps the turn, a decoy passes it, two decoys in a row = "you got hacked, start over". One Shield hint each.
**Loop.** Tap, lesson, next player, until 8 found or 120 s.
**Screens.** Setup, Scene with turn banner and timer, Lesson popover, Leaderboard, Play again.
**Scoring.** +150 per risk, -50 per hint, hacked resets the player's score to 0.
**Acceptance.**
- [ ] 8 `data-risk="true"` and at least 6 `data-risk="false"` tiles.
- [ ] With 3 players, finding all 8 shows `leaderboard` with "8/8" and 3 sorted rows; `turn-banner` changes on a decoy and not on a find.
- [ ] Two decoys in a row show `hacked-banner` and zero that player's score.
- [ ] `hint-btn` highlights one unfound risk, once per player.
- [ ] `?fast=1` sets the timer to 3 s and results appear.
**Effort.** 2 to 3 agent hours.

### Game C: Phish or Fine? Buzzer Battle (mixed review)

**Concept.** The Kahoot and pop-up quiz ideas as a buzzer race. Two buzz zones per heat (top/bottom on a phone, left/right on a laptop; keys A/S and K/L); with 3 to 6 players it runs as a bracket of 2-player heats, winners advance, all scores feed one leaderboard. Shield's per-player debrief names the categories they lost on, the "personalized" part.
**Loop.** Snippet, buzz within 6 s, reveal + lesson, next. Bank of 24 over all 8 categories, no repeats: 2 players get one 12-snippet heat, 3 to 6 players get 4 per heat.
**Screens.** Setup, Bracket, countdown, Question, Reveal, Debrief, Leaderboard.
**Scoring.** +100 first correct buzz, -50 wrong buzz (the other player may then answer), 3 in a row gives x1.5.
**Acceptance.**
- [ ] Bank of 24, each item one category; no item repeats in a match; `?seed=` makes it deterministic.
- [ ] Keys A/S/K/L and taps on `p1-phish`, `p1-fine`, `p2-phish`, `p2-fine` all register.
- [ ] A scripted run where player 2 misses only "urgency" items shows "urgency" in `p2-debrief`.
- [ ] With 4 players the bracket runs 3 heats and `leaderboard` shows 4 sorted rows.
- [ ] No buzz in 6 s reveals and advances.
**Effort.** 1 to 2 agent hours.

## 7. Game selection hub and shared menu

**Hub (`/index.html`).** The main game selection page. One card per game with name, one-line pitch, players ("2 to 6") and minutes ("about 3"), and a Play button that opens `games/<slug>/` in the same tab. Cards come from one `GAMES` array, so registering a game is one entry. One column at 360 px.

**Menu (choice: shared files).** `shared/menu.js` and `shared/menu.css`, loaded by every game with `<script src="/shared/menu.js" defer>`, not inlined, so one fix lands everywhere. The script adds a top bar with the game name and a **Menu** button (`menu-btn`) that opens a panel (`menu-panel`) with **Game selection** (back to `/`), **Restart**, **Shield on/off** and **How to play**. Each game registers hooks: `Menu.init({name, restart, setShield, howTo})`.

**Hub and menu acceptance.**
- [ ] `/` returns 200 and shows one `game-card` per entry in `GAMES`, each with name, pitch, players and minutes.
- [ ] Clicking a card's `play-btn` loads that game; inside it `menu-btn` is visible at 360x640 and 1280x800, with no horizontal scroll.
- [ ] `menu-game-selection` returns to `/`; `menu-restart` resets the game to its setup screen; `menu-shield` toggles Shield and its label shows the state; `menu-howto` opens rules text; Esc closes `menu-panel`.
- [ ] Menu buttons are at least 44 px tall and reachable by keyboard (Tab, Enter).

## 8. Repo layout and Fly.io deploy

New **private** GitHub repo `braven-capstone-games` on Wally's account, no GitHub Pages. Clone: `/Users/wally/Documents/GitHub/braven-capstone-games`.

```
index.html                    game selection hub
shared/menu.js, shared/menu.css
games/inbox-showdown/index.html
games/first-week-hunt/index.html
games/buzzer-battle/index.html
tests/hub.spec.js, tests/<slug>.spec.js   Playwright
package.json                  devDependency @playwright/test only
Dockerfile, fly.toml, .dockerignore, README.md
```

**Serving.** One Fly app serves the repo root as a static site. `Dockerfile`: `FROM nginx:alpine`, copy `index.html`, `shared/` and `games/` into `/usr/share/nginx/html`, and a small nginx conf listening on 8080. `fly.toml`: app `braven-capstone-games` (suggested), one `[http_service]` with `internal_port = 8080`, `force_https = true`, `auto_stop_machines = "stop"`, `auto_start_machines = true`, `min_machines_running = 0` (near-zero idle cost), and an http check on `GET /`.

**Steps.** Wally runs `fly auth login` himself; Claude never logs in to Fly. Then `fly launch --no-deploy --name braven-capstone-games --copy-config` (keeps the committed fly.toml), then `fly deploy`. Both need network. URL: `https://braven-capstone-games.fly.dev/`. **Health check:** `GET /` returns 200 and the page lists every game in `GAMES`. 

## 9. Goal prompts

Run A first, then B and C. Offline, a run builds, tests and commits, then reports "push/deploy pending, offline".

### Goal A: hub, menu, Fly config, Inbox Showdown

> Build the hub, shared menu, Fly config and "Inbox Showdown" per /Users/wally/Documents/School/fall-2026/braven/capstone/sample-games-SPEC.md. Read sections 3 to 8 first.
> Setup: if /Users/wally/Documents/GitHub/braven-capstone-games is missing, create it with the section 8 layout, `git init -b main`, `gh repo create braven-capstone-games --private --source . --push`. Never enable GitHub Pages. Otherwise `git pull --rebase`.
> Build index.html (hub with a GAMES array, Inbox Showdown as the first entry), shared/menu.js and shared/menu.css per section 7, then the Dockerfile, .dockerignore and fly.toml per section 8.
> Build games/inbox-showdown/index.html as one self-contained file: 2 to 6 team pass-and-play with pass screens and a leaderboard, 18 fictional Northbridge messages (10 risky: look-alike domain, urgency, credential ask, gift card, odd attachment, fake IT call; 8 legit), 3 per team, Challenge/steal, and the inline Shield object from section 4 with beforeAction, afterAction, debrief and the ?shield param. All moves through dispatch(move). Include the shared menu. Use the listed data-testids.
> Test: write tests/hub.spec.js (every hub and menu checkbox) and tests/inbox-showdown.spec.js (every Game A checkbox), Serve with `python3 -m http.server`, `npx playwright install chromium` if needed, run both; fix until green. If Docker is available, build the image and curl `/` for 200.
> Ship: commit "Add hub, menu, Fly config and Inbox Showdown", pull --rebase, push. If `fly auth whoami` succeeds, `fly launch --no-deploy --name braven-capstone-games --copy-config` (once) and `fly deploy`, then curl fly.dev `/` until 200 with the game listed. Never run `fly auth login`.
> Stop when all tests pass, the commit is on origin/main, and either the Fly health check passes or the report says "deploy pending, Wally to run fly auth login". After 5 failed fixes on one test, stop and report. No Cognizant branding, no messages, no other repos. Report: URL or local path, tests, skips.

### Goal B: First Week Hunt

> Build "First Week Hunt" per /Users/wally/Documents/School/fall-2026/braven/capstone/sample-games-SPEC.md, sections 3 to 8.
> Setup: in /Users/wally/Documents/GitHub/braven-capstone-games run `git pull --rebase`. If the repo or hub is missing, stop and report "run Goal A first".
> Build games/first-week-hunt/index.html as one self-contained file: the Game B office grid with its 8 risks and 6+ decoys, hot-seat turns for 2 to 6 players with a final leaderboard, the two-decoys "hacked" reset, one Shield hint per player, a lesson line per risk, the 120 s timer and ?fast=1. Include the section 4 Shield object (hints, explain-why, debrief) and route moves through dispatch(move). Include the shared menu. Use the listed data-testids.
> Add its GAMES entry and README row.
> Test: write tests/first-week-hunt.spec.js covering every Game B checkbox plus the hub and menu checks for this game; rerun tests/hub.spec.js. Run against `python3 -m http.server`; fix until green.
> Ship: commit "Add First Week Hunt", pull --rebase, push; if `fly auth whoami` succeeds, `fly deploy` and curl the fly.dev `/` until 200 with the new card.
> Stop when all tests (including its hub card and menu) pass, the commit is on origin/main, and Fly is healthy or the report says "deploy pending". After 5 failed fixes on one test, stop and report. No Cognizant branding, no messages, no edits beyond this game and its GAMES entry. Report: URL or local path, tests, open issues.

### Goal C: Phish or Fine? Buzzer Battle

> Build "Phish or Fine? Buzzer Battle" per /Users/wally/Documents/School/fall-2026/braven/capstone/sample-games-SPEC.md, sections 3 to 8.
> Setup: in /Users/wally/Documents/GitHub/braven-capstone-games run `git pull --rebase`. If the repo or hub is missing, stop and report "run Goal A first".
> Build games/buzzer-battle/index.html as one self-contained file: 2 to 6 players run as a bracket of 2-player heats feeding one leaderboard, split-screen heats (keys A/S and K/L plus taps), 24 fictional snippets over the 8 Shield categories, Game C heat sizes, ?seed=, 6 s per item, Game C scoring and steal, a 3-2-1 countdown, and a per-player Shield debrief from the section 4 object. Moves through dispatch(move). Include the shared menu. Use the listed data-testids.
> Add its GAMES entry and README row.
> Test: write tests/buzzer-battle.spec.js covering every Game C checkbox, including the run where player 2 misses only urgency items. Use Playwright's clock for the timer. Add the hub and menu checks for this game. Run against `python3 -m http.server`; fix until green.
> Ship: commit "Add Buzzer Battle", pull --rebase, push; if `fly auth whoami` succeeds, `fly deploy` and curl the fly.dev `/` until 200 with the new card.
> Stop when all tests (including its hub card and menu) pass, the commit is on origin/main, and Fly is healthy or the report says "deploy pending". After 5 failed fixes on one test, stop and report. No Cognizant branding, no messages, no edits beyond this game and its GAMES entry. Report: URL or local path, tests, open issues.

## 10. Open questions for Wally

1. Fly app name: keep `braven-capstone-games` (URL braven-capstone-games.fly.dev)?
2. Which Fly org owns it, your personal one or a team org?
3. Do teammates need accounts or a password on the site, or is an unlisted public URL fine?
4. Is Rose's "game prototype" a game wrapping the AI agent, or a separate idea (Kahoot, scavenger hunt)?
5. Build Shield Check (section 4) too, as a fourth card in the hub?

## 11. v4 polish (his 6:28 PM feedback)

_Sat 11/7/2026. Wally's DM, 6:28 PM: "The games are unintuitive hard to understand and boring and there's no clear way to find how to play use 11 labs to make an audio tutorial guide when loading the game that could be optionally skipped make it visually appealing and fun making interactive at Voice and sound effects use colorful colors and fun animations"._

**What changed**
- **Audio tutorial on load, skippable.** `shared/tutorial.js` opens a full-screen How to play overlay on every game: 4 to 5 illustrated steps, captions always visible, progress dots, Back/Next, a big Skip button, a "skip next time" box remembered per game, Esc/arrow keys, re-openable from Menu > How to play, from a How to play button on each setup screen and from the hub ("Watch the 30-second tutorial", `?tutorial=1`).
- **Voice.** A warm coach reads every step. Scripts: `shared/narration/<slug>/script.json` (no company names). ElevenLabs generation is scripted in `tools/generate-narration.sh` (same voice and model as the walkthrough tooling) but the account was out of credits on 11/7 (0 of 32,373 characters left, `quota_exceeded`), so the tutorial currently uses the browser's speech-synthesis voice with the same captions. MP3s take over automatically once generated (about 1,500 characters for all three games).
- **Sound effects.** `shared/audio.js`: WebAudio tap, correct, wrong, Shield warning, countdown tick, go, win fanfare; one global mute for effects and voice (top-bar 🔊 button, tutorial Voice on/off).
- **Colorful and fun.** `shared/theme.css` + `shared/fx.js`: gradient background, five vivid accents, rounded cards, bigger type, screen fades, correct = green pulse + confetti, wrong = red shake, Shield warning = amber glow, animated countdown and last-seconds ticks, a celebratory winner banner and podium-style leaderboard. Reduced-motion users get no animation.
- **Intuitive.** One-line goal and quick-rule chips under each title, a pulsing first-move hint on the first turn, icon buttons with plain labels ("📂 Open (safe)", "🚩 Report (scam)"), a "What just happened" line after each move, and hub cards with a goal line, players, minutes and the tutorial link.

**Acceptance (all automated, `npx playwright test`)**
- [x] Tutorial shows on first load, Skip hides it, "skip next time" persists across reloads, Menu > How to play re-opens it, `?tutorial=1` forces it.
- [x] Narration reads each caption (speech fallback when no MP3; a broken MP3 also falls back), the mute toggle silences it and persists, and nothing logs a console error with autoplay blocked.
- [x] Every earlier game, hub and menu check still passes; zero console errors, no outside requests, no horizontal scroll at 360 px, buttons at least 44 px.

**Follow-up (his 7:24 PM DMs):** the tutorial now opens with a narrated storytelling intro (step 0: Northbridge, a new hire's first week, the one quiet click, Shield the sidekick, a hook to play; no mention of where the games come from) and a "What is this game?" step (premise, players, rounds, how to win, length) before the how-to steps. All 20 steps are ElevenLabs MP3s; Skip and "skip next time" cover the whole tutorial.

**v5 (his 11/7 DMs and session asks, 7:33 to 7:55 PM):** "The entire game should be narrated anything that the user is supposed to read to play ... It should be intuitive when the narration plays and an intuitive replay button if you hear it again." / "games should be forced full page" / "the create teams field should be a gui experience not a text box" / Pages project site.
- [x] `shared/narrate.js`: every block a player reads is narrated (messages, office spots, snippets, turn prompts, Shield hints, warnings, coach tips, results and lessons, leaderboards, debriefs, hub card pitches on tap/focus); one queue, warnings and results interrupt, a block leaving the screen stops; pulsing 🔊 badge and outline on the block being read; a 🔁 Replay button on every narrated block; shares the mute; waits for the tutorial.
- [x] Lines per page in `shared/narration/<slug>/lines.json`, extracted from each page's `narrationLines()` (tests fail if they drift); 163 of 274 lines voiced with ElevenLabs (14,983 characters, under the 15,000 budget), the rest on the browser voice (tips, safe-habit lines, most Phish or Fine lessons).
- [x] Full page: viewport-filling layout (100dvh), no page scroll, type scales up on desktop, safe areas; fullscreen requested on Start, Menu > Fullscreen on/off.
- [x] Team / player picker (`shared/roster.js`): −/+ and 2..6 chips, avatar cards, tap-to-rename; no text box.
- [x] Relative paths throughout; `tests/subpath.spec.js` serves the repo under `/braven-capstone-games/` with no 404s.
- [x] Tests: `tests/narration.spec.js` (indicator, Replay, mute, manifest sync and files, hub focus/tap, full-page size at 360x640 and 1280x800, Menu Fullscreen item); test browsers run with `--mute-audio` and simulated speech so nothing is heard during a run.

**Still to do**
- Playtest with the team on a Zoom share and tune the wording of the hints.
- Voice the remaining 111 lines when ElevenLabs credits allow (`STEPS=0 MAX_CHARS=... tools/generate-narration.sh`).
- Phish or Fine reveals auto-advance after 3.5 s, which cuts Shield's spoken lesson short; Replay is on the screen only until then.

**v6 (his 11/7 session asks, 8:12 to 8:40 PM):** "Can we add server logic so each screen knows who's playing" / "You could host a server locally if that's possible" / "This is only a demo anyways"; "also when someone gets something wrong or incorrect there should be a full screen animation with sound affects, there should be a varity of animation that could play and should be selected randomly"; "also full screen punch in selcetion animations whe a user make a selection with a sound affect".
- [x] Room mode (section 5): `server/index.js` (static + `/ws` + `/healthz`), `shared/net.js` (host lobby with inline QR, phone player view, move validation, reconnect), "📱 Play on phones" on every setup screen; live on this Mac at port 8080 behind the Cloudflare quick tunnel.
- [x] `FX.wrongFull()`: six random full-screen wrong-answer animations, each with its own WebAudio sound, on every wrong outcome in all three games; lighter on the responsible phone; tap to dismiss, never blocks input, reduced-motion still card.
- [x] `FX.selectPunch()`: every selection punches in full screen with a whoosh + thud; host and (lighter) phone in room mode.
- [x] Tests: `tests/rooms.spec.js` (5) and `tests/wrong-fx.spec.js` (5); 115 checks green.
- [x] Desktop portrait frame (his 9:00 PM ask): wider than 600 px every page, host screen included, is a centred 430 px full-height phone column on a blurred theme backdrop with the phone layout and every overlay inside it (`--vw`/`--pf-gap` in shared/theme.css); phones unchanged; `tests/portrait-frame.spec.js` (9), 124 checks green.

**Still to do (v6)**
- The room code lives only as long as the server process; restarting it ends every room.
- No per-player hidden information yet (every phone could be shown the same echo); Phish or Fine phones sit idle while they are not in the current heat.

**v7 (Tue 11/10, Wally's 1:35 PM bug list and "multi screen experience with lobbys")**
- [x] One narration voice: clips-only by default (no system voice mixed in), clips preloaded, failing clips retried then skipped; tutorial likewise; `?voice=mixed` restores the fallback (`tests/resilience.spec.js`, `tests/tutorial.spec.js`).
- [x] Hardening: any one shared file failing leaves every game playable (inline Roster fallback).
- [x] Multi-screen lobby: hub panel + "Host multi-screen" per card (`?host=1` opens the room lobby), `/join/` by code, Phish or Fine played end to end from two phones (`tests/rooms.spec.js`, 2 more checks). 135 checks green.
- [ ] 111 lines (7,521 characters) still have no ElevenLabs clip and are now silent; voicing them needs pay-as-you-go credits (Wally's yes).
- [x] Phone fit: Phish or Fine's arena fills the screen so both buzz zones and the timer stay visible at 360x640 / 375x667 (the message scrolls inside); Inbox Showdown's Open / Report / Ask Shield stick to the bottom; Replay is readable on light cards (`tests/phone-fit.spec.js`, 7 checks; 142 green).
- [x] First Week Hunt more interactive: Fix it! (3 choices, +50, optional), hot-streak banner, 20 s per-turn shot clock (`?turnclock=`), fixed spots marked; fix choices on the finder's phone in room mode (`tests/first-week-hunt.spec.js`, 2 more; 144 green).
- [x] Shield Check (section 4 standalone prototype, open question 5): `shield/` page with paste-to-check traffic light, reasons, Report to IT (demo) and the "How Shield would work" plan; hub "Meet Shield" card (`tests/shield-check.spec.js`; 145 green).
- [x] Phish or Fine multi-screen with 3+ phones: phones not in the current heat make crowd calls (no points, tally on the phone, crowd line on the host reveal); Hunt fix choices from the phone (`tests/rooms.spec.js`; 146 green).
