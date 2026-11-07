# Braven Capstone sample games: build spec

_Sat 11/7/2026, for Wally before the 8 PM Zoom with Rose. Per his 5:05 PM brief: interactive, multiplayer, educational cyber-safety games plus an agent assistant that helps avoid human error. Spec only._

## 1. Capstone context

- **Partner:** Cognizant. **Challenge (Braven's wording):** "How might Cognizant reinvent cybersecurity awareness for a workforce that expects personalized, interactive, and on-demand learning?" (capstone-notes-page.html, A.2)
- **User group:** non-technical employees, especially young professionals and new hires (Alaina: "18-29, some tech knowledge, new to Cognizant").
- **Problem (Wally, 11/6):** "cybersecurity safety is often overlooked in favor of comfort".
- **Selected idea:** the AI agent assistant (Wally, WhatsApp 11/6 5:22 AM), "an AI agent that is specifically assigned to like help this person", so a new hire gets correct security info fast and can check a suspicious email or link before opening it (Mike Cooley call, 11/5). Scope "to be defined with the team".
- **Other marked ideas:** Kahoot!, roleplay/flowcharts, scavenger hunt ("Go to the wrong area, and you say you got hacked. Start over!").
- **Roles:** Wally Coordinator, Rose (Rosmeiry) Prototyper, Alaina and Mohammad Researchers, Alejandro and Idalis Presentation Designers, Emmanuel Visual Editor. Prototype draft due before Lab 11, Wed 11/11.
- **"The game prototype":** the only record is the class log's paraphrase of Rose's Fri 10:30 PM message ("help conceptualize the game prototype"). No file defines the game or its link to the AI agent idea. **UNVERIFIED, ask Wally.** So every game below puts the agent inside it.

## 2. Brainstorm (8 ideas)

1. **Inbox Showdown:** teams take turns triaging a shared inbox; the assistant warns before a risky click.
2. **First Week Hunt:** hot-seat scavenger hunt for hidden risks in an office; wrong taps get you "hacked".
3. **Phish or Fine? Buzzer Battle:** Kahoot-style buzzer race to call snippets safe or unsafe.
4. **The Pretexter:** one player reads a scripted scam-call card, the other must verify before giving info.
5. **Password Forge:** teams build passphrases, an attacker card tries to crack them, MFA as a power-up.
6. **Push Fatigue:** a flood of MFA prompts; approve only the real one while the assistant flags repeats.
7. **Overshare Detective:** spot what in a fake social post (badge, screen, travel dates) helps an attacker.
8. **Patch Race:** teams spend turns on updates, locks and backups before a breach card hits.

**Developed: 1, 2, 3.** Together they cover phishing, social engineering, passwords/MFA, oversharing and device hygiene, match the team's marked ideas (AI agent, scavenger hunt, Kahoot), and each fits one file. 4 and 5 suit live roleplay.

## 3. Shared rules for every game

One `index.html`, inline CSS/JS; no build step, backend, accounts, network requests or external assets. Works at 360 px wide. A full match is under 3 minutes. **Multiplayer is same-screen:** 2 to 6 named players or teams, pass-and-play, hot-seat or split-screen buzzers, on one screen or a Zoom share. Every game keeps per-player scores and ends on a leaderboard (`leaderboard`, sorted high to low). A fictional company ("Northbridge Co.") and fictional senders only, never Cognizant's name, logo or staff. Every control has a `data-testid`. All moves go through one `dispatch(move)` function that updates one `state` object (section 5). The assistant "Shield" is **scripted** and labelled "prototype, scripted agent".

## 4. Agent assistant that helps avoid human error

**Purpose.** The team's selected idea, inside each game: Shield watches choices and steps in **before** a mistake.

**Behaviour, four levels.**
1. **Nudge (before):** a risky action on a flagged item is paused: "Hold on, the sender is northbr1dge.co, not northbridge.co. Still open it?" Confirm or back out.
2. **Explain-why (after):** one line naming the red flag and the safe habit.
3. **Personalize:** tracks misses across 8 categories (urgency, look-alike domain, credential ask, gift card, attachment, MFA fatigue, oversharing, device hygiene) and nudges sooner where a player keeps missing.
4. **Debrief (end):** each player's two weakest categories with a tip, and "Shield stopped N mistakes".

**What it logs.** In-memory `shieldLog` per player: item, category, action, warned or not, backed out or not, seconds to decide. Debrief and leaderboard read it; nothing leaves the page. "Copy results" gives the team numbers for the deck.

**How it plugs in.** One inline object `Shield` with `beforeAction(player, action, item)` returning `{allow, warning}`, `afterAction(...)` returning a lesson, and `debrief(player)`. `?shield=off|nudge|coach` sets the level; a match with it off then on gives the deck a before/after error count.

**Per game.** A: nudge before a risky Open, explain after every reveal. B: hints, and a warning after the first decoy tap. C: no mid-race nudges, full debrief per player.

**Standalone prototype ("Shield Check", a later fourth page).** The chat sidekick or browser extension a real employee would have: paste a message (or click "Check with Shield") before acting and get a traffic light (safe / careful / stop), the reasons (look-alike domain, urgency, credential or payment ask, short link, risky attachment) and "Report to IT". Rule-based and local in the prototype. A real model slots in at one point: `Shield.assess(text)` calls a language model (plus company allowlists and threat feeds) instead of the rules. The page says it is a demo, not a security tool.

## 5. Real-time rooms later

All play runs through `dispatch(move)` on one serializable `state`, so a later version only adds a transport: the host makes a room code, phones join, moves travel over a small relay (Firebase Realtime Database, a tiny WebSocket server, or WebRTC via PeerJS), the host applies them and broadcasts `state`. Same-screen stays as the fallback.

## 6. The three games

### Game A: Inbox Showdown (phishing + social engineering)

**Concept.** Day one at Northbridge. 2 to 6 players or teams share one inbox on one device or a Zoom share. On its turn a team gets a message (email, SMS, chat, or a "call from IT") and picks **Open**, **Report** or **Ask Shield**. Other teams may **Challenge** for steal points, so everyone argues it out loud.
**Loop.** Message, decision, optional challenge, reveal + lesson, next team. 3 messages per team per match (12 for 4 teams), drawn from a bank of 18 (10 risky, 8 legit).
**Screens.** Setup (2 to 6 names), "Pass to <team>" screen, Turn card, Reveal, Leaderboard, Debrief, Play again.
**Scoring.** +100 correct, +60 correct after asking Shield, +50 steal on a correct challenge, -50 for opening a phish.
**Art.** CSS cards, emoji, team colours.
**Acceptance.**
- [ ] Zero console errors, zero network requests besides the page.
- [ ] Setup accepts 2 to 6 names and rejects 1 or 7; turns rotate in order; each team gets 3 messages; a pass screen shows between turns.
- [ ] `btn-open`, `btn-report`, `btn-ask`, `btn-challenge` work; `btn-ask` shows `agent-hint` for every message.
- [ ] With `?shield=nudge`, opening a risky message first shows `shield-warning`; with `?shield=off` it does not.
- [ ] Scripted all-correct match gives each team 300; `leaderboard` lists every team sorted by score; `debrief` lists each team's weakest categories.
- [ ] `restart-btn` resets scores; 375x667 has no horizontal scroll; buttons at least 44 px.
**Effort.** 2 to 3 agent hours.

### Game B: First Week Hunt (passwords/MFA, device hygiene, oversharing)

**Concept.** Alaina's scavenger hunt, hot-seat. An office scene (CSS grid) hides 8 risks: password sticky note, unlocked laptop, lobby USB stick, QR flyer, tailgater, oversharing phone post, ignored "update later" banner, an unrequested MFA prompt. 2 to 6 players take turns; a find keeps the turn, a decoy passes it, two decoys in a row = "you got hacked, start over". One Shield hint each.
**Loop.** Tap, lesson, next player, until all 8 found or 120 s ends.
**Screens.** Setup (2 to 6 names), Scene with turn banner and timer, Lesson popover, Leaderboard with each player's finds, Play again.
**Scoring.** +150 per risk, -50 per hint, hacked resets the player's score to 0.
**Art.** Emoji tiles on a CSS grid with decoys (coffee, plant, stapler).
**Acceptance.**
- [ ] Zero console errors, zero extra network requests.
- [ ] 8 `data-risk="true"` and at least 6 `data-risk="false"` tiles.
- [ ] With 3 players, finding all 8 shows `leaderboard` with "8/8" and 3 sorted rows; `turn-banner` changes on a decoy and not on a find.
- [ ] Two decoys in a row show `hacked-banner` and zero that player's score.
- [ ] `hint-btn` highlights one unfound risk, once per player.
- [ ] `?fast=1` sets the timer to 3 s and results appear; 375x667 has no horizontal scroll.
**Effort.** 2 to 3 agent hours.

### Game C: Phish or Fine? Buzzer Battle (mixed review)

**Concept.** The Kahoot and pop-up quiz ideas as a buzzer race. Two buzz zones per heat (top/bottom on a phone, left/right on a laptop; keys A/S and K/L); with 3 to 6 players it runs as a bracket of 2-player heats, winners advance, all scores feed one leaderboard. Shield's per-player debrief names the categories they lost on, the "personalized" part.
**Loop.** Snippet, buzz within 6 s, reveal + lesson, next. Bank of 24 over all 8 categories, no repeats: 2 players get one 12-snippet heat, 3 to 6 players get 4 per heat.
**Screens.** Setup (2 to 6 names), Bracket, 3-2-1 countdown, Question, Reveal, Debrief, Leaderboard, Rematch.
**Scoring.** +100 first correct buzz, -50 wrong buzz (the other player may then answer), 3 in a row gives x1.5.
**Art.** Two big colour zones, CSS shapes, progress bar.
**Acceptance.**
- [ ] Zero console errors, zero extra network requests.
- [ ] Bank of 24, each item one category; no item repeats in a match; `?seed=` makes it deterministic.
- [ ] Keys A/S/K/L and taps on `p1-phish`, `p1-fine`, `p2-phish`, `p2-fine` all register.
- [ ] A scripted run where player 2 misses only "urgency" items shows "urgency" in `p2-debrief`.
- [ ] With 4 players the bracket runs 3 heats and `leaderboard` shows 4 sorted rows.
- [ ] No buzz in 6 s reveals and advances; 375x667 has no horizontal scroll.
**Effort.** 1 to 2 agent hours.

## 7. Repo layout

New repo `braven-capstone-games` on Wally's GitHub. **Visibility is his choice:** (a) **private**, Pages off (private Pages needs a paid plan), play by opening the HTML files or on Wally's screen share; or (b) **public** with Pages, play by link. No personal data in it either way. Local clone: `/Users/wally/Documents/GitHub/braven-capstone-games`.

```
index.html                    hub: one card per game
README.md                     play links, "scripted prototype" note
games/inbox-showdown/index.html
games/first-week-hunt/index.html
games/buzzer-battle/index.html
tests/<slug>.spec.js          one Playwright spec per game
package.json                  devDependency @playwright/test only
.nojekyll
```

If public, Pages from `main` root: `gh api -X POST repos/<owner>/braven-capstone-games/pages -f "source[branch]=main" -f "source[path]=/"`. Links: `https://<owner>.github.io/braven-capstone-games/games/<slug>/`.

## 8. Goal prompts

Run A first (it creates the repo), then B and C. Each run touches only its own game, spec, hub card and README row. Offline, a run builds, tests and commits, then stops with "push pending, offline".

### Goal A: Inbox Showdown

> VISIBILITY: ____ (Wally fills in private or public before running).
> Build "Inbox Showdown" per /Users/wally/Documents/School/fall-2026/braven/capstone/sample-games-SPEC.md. Read sections 3 to 7 first.
> Setup: if /Users/wally/Documents/GitHub/braven-capstone-games is missing, create it with the section 7 layout, `git init -b main`, then `gh repo create braven-capstone-games --private --source . --push` (Pages off) if VISIBILITY is private or blank, or `--public` plus the section 7 Pages call if public. Otherwise `git pull --rebase`.
> Build games/inbox-showdown/index.html as one self-contained file: 2 to 6 team pass-and-play with pass screens and a leaderboard, 18 fictional Northbridge messages (10 risky: look-alike domain, urgency, credential ask, gift card, odd attachment, fake IT call; 8 legit), 3 per team, Challenge/steal, and the inline Shield object from section 4 with beforeAction, afterAction, debrief and the ?shield param. All moves through dispatch(move). Use the listed data-testids.
> Test: write tests/inbox-showdown.spec.js covering every Game A checkbox, with a 375x667 check and a listener that fails on any request other than the page. Serve with `python3 -m http.server`, run `npx playwright install chromium` if needed, then the spec; fix until green.
> Ship: commit "Add Inbox Showdown", pull --rebase, push; if public, curl the Pages URL until 200 (10 minutes max).
> Stop when all Game A tests pass, the commit is on origin/main and, if public, the URL returns 200. After 5 failed fix cycles on one test, stop and report. Never use Cognizant branding, never message anyone, never touch other repos. Report: play URL (or local file path if private), test summary, anything skipped.

### Goal B: First Week Hunt

> Build "First Week Hunt" per /Users/wally/Documents/School/fall-2026/braven/capstone/sample-games-SPEC.md. Read sections 3 to 7 first.
> Setup: in /Users/wally/Documents/GitHub/braven-capstone-games run `git pull --rebase`. If the repo is missing, stop and report "run Goal A first".
> Build games/first-week-hunt/index.html as one self-contained file: an emoji office scene on a CSS grid with the 8 risks in Game B (data-risk="true") and at least 6 decoys, hot-seat turns for 2 to 6 players with a final leaderboard, the two-decoys "hacked" reset, one Shield hint per player, a lesson line per risk, the 120 s timer and ?fast=1. Include the section 4 Shield object (hints, explain-why, debrief) and route moves through dispatch(move). Use the listed data-testids.
> Test: write tests/first-week-hunt.spec.js covering every Game B checkbox. Run it against `python3 -m http.server`; fix until green.
> Ship: update only this game's hub card and README row, commit "Add First Week Hunt", pull --rebase, push; if public, curl the Pages URL until 200 (10 minutes max).
> Stop when all Game B tests pass, the commit is on origin/main and, if public, the URL returns 200. After 5 failed fixes on one test, stop and report. No Cognizant branding, no messages, no edits outside this game's files. Report: play URL (or local file path if private), test summary, open issues.

### Goal C: Phish or Fine? Buzzer Battle

> Build "Phish or Fine? Buzzer Battle" per /Users/wally/Documents/School/fall-2026/braven/capstone/sample-games-SPEC.md. Read sections 3 to 7 first.
> Setup: in /Users/wally/Documents/GitHub/braven-capstone-games run `git pull --rebase`. If missing, stop and report "run Goal A first".
> Build games/buzzer-battle/index.html as one self-contained file: 2 to 6 players run as a bracket of 2-player heats feeding one leaderboard, split-screen heats (keys A/S and K/L plus taps), 24 fictional snippets over the 8 Shield categories, heat sizes per the Game C loop, drawn with ?seed=, 6 s per item, the Game C scoring with steal after a wrong buzz, a 3-2-1 countdown, and a per-player Shield debrief from the section 4 object. Moves through dispatch(move). Use the listed data-testids.
> Test: write tests/buzzer-battle.spec.js covering every Game C checkbox, including the run where player 2 misses only urgency items. Use Playwright's clock for the timer. Run it against `python3 -m http.server`; fix until green.
> Ship: update only this game's hub card and README row, commit "Add Buzzer Battle", pull --rebase, push; if public, curl the Pages URL until 200 (10 minutes max).
> Stop when all Game C tests pass, the commit is on origin/main and, if public, the URL returns 200. After 5 failed fixes on one test, stop and report. No Cognizant branding, no messages, no edits outside this game's files. Report: play URL (or local file path if private), test summary, open issues.

## 9. Open questions for Wally

1. Private repo (play by opening the files) or public with Pages (play by link)? Goal A has a VISIBILITY blank for it.
2. Is Rose's "game prototype" a game wrapping the AI agent, or a separate idea (Kahoot, scavenger hunt) the team moved to?
3. Are these samples for Rose to learn from, or the team's actual Lab 11 prototype?
4. OK to call the agent "Shield" and keep Cognizant's name out of the games?
5. Build Shield Check (section 4) too, as the agent's own demo for the deck?
