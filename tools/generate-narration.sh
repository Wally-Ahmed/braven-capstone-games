#!/bin/bash
# Generates the tutorial narration MP3s with ElevenLabs from shared/narration/<slug>/script.json.
# Usage: ENV_FILE=/path/to/file-with-ELEVENLABS_API_KEY tools/generate-narration.sh [slug ...]
#   (default ENV_FILE is ./.env, which is gitignored). The key is only read into this shell.
# Writes shared/narration/<slug>/step<N>.mp3 and adds "audio": "step<N>.mp3" to that step in
# script.json only when the file came back as real audio, so the games never request a missing file.
# Voice and model match the walkthrough tooling: voice DbwWo4rVEd5NrejHYUnm, eleven_multilingual_v2.
set -u
cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env}"
if [ -z "${ELEVENLABS_API_KEY:-}" ] && [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi
[ -n "${ELEVENLABS_API_KEY:-}" ] || { echo "ELEVENLABS_API_KEY not set (ENV_FILE=$ENV_FILE)"; exit 1; }
VOICE="${VOICE:-DbwWo4rVEd5NrejHYUnm}"
MODEL="${MODEL:-eleven_multilingual_v2}"
SLUGS=("$@"); [ ${#SLUGS[@]} -eq 0 ] && SLUGS=(inbox-showdown first-week-hunt phish-or-fine)

curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/user/subscription |
  python3 -c 'import sys,json; d=json.load(sys.stdin); print("quota:", d.get("character_count"), "/", d.get("character_limit"))' || true

fail=0
for slug in "${SLUGS[@]}"; do
  dir="shared/narration/$slug"; json="$dir/script.json"
  n=$(python3 -c "import json; print(len(json.load(open('$json'))['steps']))")
  for ((i=0; i<n; i++)); do
    text=$(python3 -c "import json; s=json.load(open('$json'))['steps'][$i]; print(s.get('say') or (s['title']+'. '+s['text']))")
    body=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": sys.argv[2], "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35}}))' "$text" "$MODEL")
    out="$dir/step$((i+1)).mp3"; tmp="$out.part"
    code=$(curl -s -o "$tmp" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE?output_format=mp3_44100_128" \
      -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" -d "$body")
    if [ "$code" = "200" ] && file "$tmp" | grep -qiE 'audio|mpeg|ID3'; then
      mv "$tmp" "$out"
      python3 - "$json" "$i" "step$((i+1)).mp3" <<'PY'
import json, sys
p, i, name = sys.argv[1], int(sys.argv[2]), sys.argv[3]
d = json.load(open(p)); d['steps'][i]['audio'] = name
open(p, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
PY
      echo "ok   $out ($(wc -c < "$out" | tr -d ' ') bytes)"
    else
      echo "FAIL $out: HTTP $code $(head -c 200 "$tmp" 2>/dev/null)"; rm -f "$tmp"; fail=1
    fi
  done
done
exit $fail
