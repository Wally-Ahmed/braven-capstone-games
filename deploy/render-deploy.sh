#!/usr/bin/env bash
# One-command Render deploy for braven-capstone-games (Render REST API v1).
#
#   ENV_FILE=~/.accountability-secrets.env deploy/render-deploy.sh
#
# Idempotent: finds the service by name and triggers a deploy, or creates it the first time.
# The API key is read from ONE line (RENDER_API_KEY=...) of ENV_FILE, never echoed, never put on a
# command line (it reaches curl through a config on stdin, so it does not show up in `ps`).
#
# Optional env: OWNER_ID (workspace id, else the personal "user" owner), SERVICE_NAME, REPO_URL,
# BRANCH, DRY_RUN=1 (read-only calls only: owners + service lookup, no create, no deploy).
set -euo pipefail

API="https://api.render.com/v1"
ENV_FILE="${ENV_FILE:-$HOME/.accountability-secrets.env}"
SERVICE_NAME="${SERVICE_NAME:-braven-capstone-games}"
REPO_URL="${REPO_URL:-https://github.com/Wally-Ahmed/braven-capstone-games}"
BRANCH="${BRANCH:-main}"
POLL_EVERY=20
POLL_MAX_SECS=720      # 12 minutes
SMOKE_MAX_SECS=90      # cold-start allowance
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAY_LINK="$SCRIPT_DIR/PLAY-LINK.md"

die() { printf 'render-deploy: %s\n' "$*" >&2; exit 1; }
say() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

command -v curl >/dev/null || die "curl is required"
command -v python3 >/dev/null || die "python3 is required"
HAVE_JQ=0; command -v jq >/dev/null && HAVE_JQ=1

# ---- 1. API key (one line from ENV_FILE, or already in the environment) ------------------------
if [[ -z "${RENDER_API_KEY:-}" ]]; then
  [[ -r "$ENV_FILE" ]] || die "ENV_FILE '$ENV_FILE' not readable and RENDER_API_KEY not set. Add a line RENDER_API_KEY=... to it (see deploy/RENDER-DEPLOY.md)."
  RENDER_API_KEY="$(
    { grep -E '^[[:space:]]*(export[[:space:]]+)?RENDER_API_KEY=' "$ENV_FILE" || true; } | tail -n 1 \
      | sed -E 's/^[[:space:]]*(export[[:space:]]+)?RENDER_API_KEY=//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
  )"
fi
[[ -n "${RENDER_API_KEY:-}" ]] || die "RENDER_API_KEY missing: no 'RENDER_API_KEY=...' line in $ENV_FILE. Create a key at dashboard.render.com > Account Settings > API Keys and add that line yourself."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# api METHOD PATH [JSON_BODY]  -> response body in $TMP/body, HTTP code on stdout
api() {
  local method="$1" path="$2" body="${3:-}" code
  local args=(-sS -o "$TMP/body" -w '%{http_code}' -X "$method" -H 'Accept: application/json' --max-time 60)
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary "$body")
  code="$(printf 'header = "Authorization: Bearer %s"\n' "$RENDER_API_KEY" | curl -K - "${args[@]}" "$API$path" 2>"$TMP/curlerr")" || code="000"
  printf '%s' "$code"
}

# jget MODE [ARG]: pull one value out of $TMP/body (jq when installed, python3 otherwise).
# Values are passed as data (--arg / argv), never spliced into code.
jget() {
  local mode="$1" arg="${2:-}" f
  if [[ $HAVE_JQ == 1 ]]; then
    case "$mode" in
      owner_by_id)    f='[.[].owner | select(.id==$a) | .id][0] // ""' ;;
      owner_personal) f='([.[].owner | select(.type=="user") | .id][0] // .[0].owner.id) // ""' ;;
      svc_by_name)    f='[.[].service | select(.name==$a) | .id][0] // ""' ;;
      created_id)     f='(.service.id // .id) // ""' ;;
      dep_id)         f='.[0].deploy.id // ""' ;;
      dep_status)     f='if length==0 then "no-deploy-yet" else (.[0].deploy.status // "") end' ;;
      svc_url)        f='.serviceDetails.url // ""' ;;
      errmsg)         f='.message // tostring' ;;
    esac
    jq -r --arg a "$arg" "$f" "$TMP/body" 2>/dev/null && return 0
  fi
  python3 - "$TMP/body" "$mode" "$arg" <<'PY' 2>/dev/null || true
import json, sys
path, mode, a = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(path).read()
try:
    d = json.loads(raw)
except Exception:
    print(raw[:300] if mode == "errmsg" else ""); sys.exit(0)
def first(it, default=""):
    return next(iter(it), default)
r = ""
if mode == "owner_by_id":
    r = first(x["owner"]["id"] for x in d if x["owner"]["id"] == a)
elif mode == "owner_personal":
    r = first((x["owner"]["id"] for x in d if x["owner"].get("type") == "user"),
              d[0]["owner"]["id"] if d else "")
elif mode == "svc_by_name":
    r = first(x["service"]["id"] for x in d if x["service"]["name"] == a)
elif mode == "created_id":
    r = (d.get("service") or d).get("id", "")
elif mode == "dep_id":
    r = d[0]["deploy"]["id"] if d else ""
elif mode == "dep_status":
    r = d[0]["deploy"].get("status", "") if d else "no-deploy-yet"
elif mode == "svc_url":
    r = (d.get("serviceDetails") or {}).get("url", "")
elif mode == "errmsg":
    r = d.get("message") if isinstance(d, dict) and d.get("message") else raw[:300]
print(r or "")
PY
}

# Prints an API error without ever printing request headers; bodies are Render JSON errors.
api_fail() {
  local what="$1" code="$2" msg
  msg="$(jget errmsg)"
  case "$code" in
    401) die "$what: HTTP 401 Unauthorized (the API key is wrong, revoked or expired). Render said: $msg" ;;
    000) die "$what: network error, no HTTP response from $API ($(head -c 200 "$TMP/curlerr" 2>/dev/null))" ;;
    *)   die "$what: HTTP $code. Render said: $msg" ;;
  esac
}

# ---- 2a. Owner --------------------------------------------------------------------------------
code="$(api GET '/owners?limit=100')"
[[ "$code" == 200 ]] || api_fail "GET /owners" "$code"
if [[ -n "${OWNER_ID:-}" ]]; then
  owner="$(jget owner_by_id "$OWNER_ID")"
  [[ -n "$owner" ]] || die "OWNER_ID $OWNER_ID is not one of this key's owners"
else
  owner="$(jget owner_personal)"
fi
[[ -n "$owner" ]] || die "no owner/workspace visible to this API key"
say "owner: $owner"

# ---- 2b. Existing service? ----------------------------------------------------------------------
code="$(api GET "/services?name=$SERVICE_NAME&ownerId=$owner&limit=20")"
[[ "$code" == 200 ]] || api_fail "GET /services" "$code"
svc="$(jget svc_by_name "$SERVICE_NAME")"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  say "DRY_RUN: service ${svc:-<none, would create>}; stopping before any mutating call."
  exit 0
fi

if [[ -n "$svc" ]]; then
  say "service exists: $svc -> triggering a deploy of the latest $BRANCH commit"
  code="$(api POST "/services/$svc/deploys" '{"clearCache":"do_not_clear"}')"
  [[ "$code" == 200 || "$code" == 201 || "$code" == 202 ]] || api_fail "POST /services/$svc/deploys" "$code"
else
  say "no service named $SERVICE_NAME -> creating it (free, docker, oregon)"
  body="$(OWNER="$owner" NAME="$SERVICE_NAME" REPO="$REPO_URL" BR="$BRANCH" python3 -c 'import json, os
print(json.dumps({
  "type": "web_service", "name": os.environ["NAME"], "ownerId": os.environ["OWNER"],
  "repo": os.environ["REPO"], "branch": os.environ["BR"], "autoDeploy": "yes", "rootDir": "",
  "serviceDetails": {
    "runtime": "docker", "env": "docker", "plan": "free", "region": "oregon",
    "envSpecificDetails": {"dockerfilePath": "./Dockerfile", "dockerContext": "."},
    "healthCheckPath": "/healthz", "pullRequestPreviewsEnabled": "no", "numInstances": 1
  }}))')"
  code="$(api POST /services "$body")"
  [[ "$code" == 200 || "$code" == 201 ]] || api_fail "POST /services" "$code"
  svc="$(jget created_id)"
  [[ -n "$svc" ]] || die "service created but no id in the response"
  say "created service $svc (Render starts the first deploy itself)"
fi

# ---- 3. Poll the latest deploy -----------------------------------------------------------------
start=$(date +%s); status=""; dep=""
while :; do
  code="$(api GET "/services/$svc/deploys?limit=1")"
  if [[ "$code" == 200 ]]; then
    dep="$(jget dep_id)"
    status="$(jget dep_status)"
    say "deploy ${dep:-?}: $status"
    case "$status" in
      live) break ;;
      build_failed|update_failed|pre_deploy_failed|canceled|deactivated)
        die "deploy $dep ended as '$status'. Logs: https://dashboard.render.com/web/$svc/deploys/$dep" ;;
    esac
  else
    [[ "$code" == 401 ]] && api_fail "GET /services/$svc/deploys" "$code"
    say "GET deploys: HTTP $code (retrying)"
  fi
  (( $(date +%s) - start >= POLL_MAX_SECS )) && die "deploy not live after 12 min (last status '$status'). Dashboard: https://dashboard.render.com/web/$svc"
  sleep "$POLL_EVERY"
done

# ---- 4. Public URL + smoke test ------------------------------------------------------------------
code="$(api GET "/services/$svc")"
url=""
[[ "$code" == 200 ]] && url="$(jget svc_url)"
[[ -n "$url" ]] || url="https://$SERVICE_NAME.onrender.com"
url="${url%/}"
say "public URL: $url"

fail=0
for p in / /join/ /shield/ /games/phish-or-fine/ /healthz; do
  t0=$(date +%s); c=000
  while :; do
    c="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$url$p" || true)"
    [[ "$c" == 200 ]] && break
    (( $(date +%s) - t0 >= SMOKE_MAX_SECS )) && break
    sleep 5
  done
  say "smoke $c $p"
  [[ "$c" == 200 ]] || fail=1
done

# ---- 5. PLAY-LINK.md ------------------------------------------------------------------------------
cat > "$PLAY_LINK" <<EOF
# Play link

**$url/**

Live on Render as of $(date '+%a %Y-%m-%d %-I:%M %p %Z') (service $svc, deploy $dep).
Join from a phone: $url/join/ with the 4-letter room code.
Smoke test: $([[ $fail == 0 ]] && echo "all five paths returned 200" || echo "one or more paths did NOT return 200, check the dashboard")

Free-plan caveats:
- The service sleeps after 15 minutes with no traffic.
- The first load after a sleep takes about a minute (cold start); open the link a minute before class.
- Rooms live in memory, so any restart, sleep or redeploy resets every open room.
EOF
cat "$PLAY_LINK"
[[ $fail == 0 ]] || exit 2
