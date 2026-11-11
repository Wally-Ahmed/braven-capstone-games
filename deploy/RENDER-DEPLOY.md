# Render deploy runbook (API, one command)

`deploy/render-deploy.sh` creates or redeploys the free Render web service `braven-capstone-games` through the Render
REST API v1, waits for the deploy to go live, smoke-tests the public URL and writes it to `deploy/PLAY-LINK.md`.
It matches `render.yaml`: Docker runtime, `./Dockerfile`, plan free, region oregon, branch main, auto-deploy on,
health check `/healthz`, PR previews off. The repo is public, so Render needs no GitHub app access to build it.

Expected URL: https://braven-capstone-games.onrender.com/ (the script uses the URL Render reports, in case the name
was taken and Render added a suffix).

## Wally does this himself (once)

1. Sign in at https://dashboard.render.com (GitHub sign-in is fine). No card is needed for the free plan.
2. Account Settings > API Keys > Create API key. Copy it.
3. Add ONE line to `~/.accountability-secrets.env` yourself (Claude never types or reads the key):

   ```
   RENDER_API_KEY=rnd_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

   Quotes and a leading `export` are both accepted. The script reads only that line, never sources the whole file
   and never prints the key (it goes to curl on stdin, so it is not visible in `ps`).

   Alternative: `composio connect render` (Composio-managed connection) if he prefers not to keep a key in the file;
   the conductor then drives the same API calls through Composio instead of this script.

## Conductor runs (repo root /Users/wally/Documents/GitHub/braven-capstone-games)

```sh
ENV_FILE=~/.accountability-secrets.env deploy/render-deploy.sh
```

- Safe to re-run: if the service exists it only triggers a new deploy of the latest `main` commit.
- `DRY_RUN=1` does the two read-only calls (owners, service lookup) and stops before anything mutating.
- `OWNER_ID=tea-...` picks a team workspace; otherwise the personal (`type: user`) owner is used.
- Exit codes: 0 live and all five smoke paths 200; 2 live but a smoke path failed; 1 any other error
  (401 bad key, deploy failed, 12-minute timeout).

What it prints: owner id, create-or-deploy, a status line every 20 s (`build_in_progress`, `update_in_progress`,
`live`, or a failure such as `build_failed`), then `smoke 200 /`, `/join/`, `/shield/`, `/games/phish-or-fine/`,
`/healthz` (up to 90 s of cold-start retries each), then the new PLAY-LINK.md.

## Free-plan caveats (also written into PLAY-LINK.md)

- Sleeps after 15 minutes with no traffic; the first load after that takes about a minute.
- Rooms are in process memory: a sleep, restart or redeploy resets every open room. Open the link a minute before
  class and keep a tab on it while playing.
- Auto-deploy is on: every push to `main` redeploys (and resets rooms). Avoid pushing during a session.

## Rollback

- Dashboard: service > Events/Deploys > pick an earlier successful deploy > Rollback.
- API (key in the environment, never echoed):

  ```sh
  curl -sS -X POST https://api.render.com/v1/services/<srv-id>/deploys \
    -K <(printf 'header = "Authorization: Bearer %s"\n' "$RENDER_API_KEY") \
    -H 'Content-Type: application/json' -d '{"commitId":"<previous commit sha>"}'
  ```

  Deploying a specific commit does not turn auto-deploy off; the next push to `main` deploys again.

## Blueprint click-through (no API key at all)

1. Dashboard > New > Blueprint > "Public Git repository": `https://github.com/Wally-Ahmed/braven-capstone-games`.
2. Render reads `render.yaml`, shows one free web service; click Apply.
3. When the deploy is live, run the smoke loop from FLY-DEPLOY.md against the `.onrender.com` URL and update
   PLAY-LINK.md (or run this script afterwards with a key: it will find the service and redeploy).
