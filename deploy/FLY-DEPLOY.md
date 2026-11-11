# Fly.io deploy runbook (Node server image)

The image runs `node server/index.js` (node:20-alpine, runtime dep `ws` only). With `PORT=8080` set (Dockerfile and
fly.toml `[env]`) the server binds `0.0.0.0:8080` and serves the static site plus the WebSocket room relay at `/ws`
(used by `/join/` and multi-screen play). Health check: `GET /` (200). `GET /healthz` also returns JSON
`{ok, rooms, uptime}`. The machine is always on (`auto_stop_machines = false`, `min_machines_running = 1`) because rooms
live in process memory and a stopped machine would drop them.

Expected URL: https://braven-capstone-games.fly.dev/

## Wally does these himself (once)

1. Install the CLI if missing: `brew install flyctl`.
2. `fly auth login` (browser login; Claude never logs in to Fly or handles the password).
3. Make sure the Fly org has a payment method (Dashboard > Billing). One always-on shared-cpu-1x 256 MB machine is a
   small monthly charge; Fly may refuse to create machines on an org without a card.

## Conductor runs these after he has logged in (repo root: /Users/wally/Documents/GitHub/braven-capstone-games)

```sh
fly auth whoami                      # confirms the login; stop if it errors
fly apps list                        # is braven-capstone-games there?
# only if it is NOT listed (creates the app, keeps the committed fly.toml, deploys nothing):
fly apps create braven-capstone-games
#   (equivalent: fly launch --no-deploy --name braven-capstone-games --copy-config)
fly deploy --remote-only             # builds on Fly's builder, no local Docker needed
fly scale count 1 --yes              # exactly one machine: rooms are in memory, two machines would split them
fly status                           # one machine, state "started", checks passing
fly logs                             # expect "Northbridge games + rooms on http://0.0.0.0:8080"
```

Smoke test after deploy:

```sh
for u in / /join/ /shield/ /games/phish-or-fine/ /healthz; do
  printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' https://braven-capstone-games.fly.dev$u)" "$u"; done
curl -sI https://braven-capstone-games.fly.dev/ | grep -i x-rooms   # "X-Rooms: 1" turns on the room-mode button
```

Then open a game on one screen, create a room, and join it from a phone at `/join/` with the 4-letter code.
Optional: `fly secrets set PUBLIC_ORIGIN=https://braven-capstone-games.fly.dev` (or a custom domain) to pin the
origin used in join links and QR codes; without it the pages use their own origin, which is already correct on fly.dev.

## Rollback

```sh
fly releases --image                 # lists versions with their image refs
fly deploy --image registry.fly.io/braven-capstone-games:<tag-or-digest-of-the-good-release>
```

## Caveats

- Every deploy (and every machine restart) resets all rooms: open games lose their room and phones must rejoin a new
  code. Deploy between sessions, not during a class or demo.
- One machine only. Do not `fly scale count 2`: rooms are per process and the relay is not shared.
- Rooms expire after 2 h idle (server/index.js); there is no persistence by design (demo).
- The image was not built locally on 2026-11-10 (Docker daemon not running); `--remote-only` builds on Fly. The
  PORT/0.0.0.0 change was verified with `PORT=8081 node server/index.js` from a clean worktree (/, /join/, /shield/,
  /games/phish-or-fine/, /healthz all 200; reachable on the LAN address; WebSocket `create` answered `created`).
