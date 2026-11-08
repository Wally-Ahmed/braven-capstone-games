#!/bin/bash
# Generates the tutorial narration MP3s with ElevenLabs from shared/narration/<slug>/script.json.
# Usage: ENV_FILE=/path/to/file-with-ELEVENLABS_API_KEY tools/generate-narration.sh [slug ...]
#   (default ENV_FILE is ./.env, which is gitignored). The key is only read into this shell.
# Writes shared/narration/<slug>/<id>.mp3 (a step's "id", else step<N> by position; the story intro is
# step0) and adds "audio": "<id>.mp3" to that step in
# script.json only when the file came back as real audio, so the games never request a missing file.
# Steps whose audio file already exists are skipped unless FORCE=1.
# Then it voices the in-game lines in shared/narration/<slug>/lines.json (hub + games; refresh that file first
# with `node tools/extract-lines.js`): lines/<id>.mp3, and "audio": true on the line once the file is real
# audio. Lines that already have audio are skipped. Lines go in priority order (1 prompts and items, 2 hints
# and lessons, 3 tips and habits) until MAX_CHARS (default 14800) new characters are used; the rest stay on
# the browser voice. LINES=0 skips the lines, STEPS=0 skips the tutorial steps.
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
[ "${STEPS:-1}" = "0" ] && SLUGS_STEPS=() || SLUGS_STEPS=("${SLUGS[@]}")
for slug in ${SLUGS_STEPS[@]+"${SLUGS_STEPS[@]}"}; do
  dir="shared/narration/$slug"; json="$dir/script.json"
  n=$(python3 -c "import json; print(len(json.load(open('$json'))['steps']))")
  for ((i=0; i<n; i++)); do
    name=$(python3 -c "import json; s=json.load(open('$json'))['steps'][$i]; print(s.get('id') or 'step$((i+1))')")
    have=$(python3 -c "import json; s=json.load(open('$json'))['steps'][$i]; print(s.get('audio') or '')")
    if [ -z "${FORCE:-}" ] && [ -n "$have" ] && [ -f "$dir/$have" ]; then echo "skip $dir/$have (already generated; FORCE=1 to redo)"; continue; fi
    text=$(python3 -c "import json; s=json.load(open('$json'))['steps'][$i]; print(s.get('say') or (s['title']+'. '+s['text']))")
    body=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "model_id": sys.argv[2], "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.35}}))' "$text" "$MODEL")
    out="$dir/$name.mp3"; tmp="$out.part"
    code=$(curl -s -o "$tmp" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE?output_format=mp3_44100_128" \
      -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" -d "$body")
    if [ "$code" = "200" ] && file "$tmp" | grep -qiE 'audio|mpeg|ID3'; then
      mv "$tmp" "$out"
      python3 - "$json" "$i" "$name.mp3" <<'PY'
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
if [ "${LINES:-1}" != "0" ]; then
  export VOICE MODEL
  python3 - "${MAX_CHARS:-14800}" hub "${SLUGS[@]}" <<'PY' || fail=1
import json, os, subprocess, sys
budget = int(sys.argv[1]); slugs = sys.argv[2:]
key, voice, model = os.environ['ELEVENLABS_API_KEY'], os.environ['VOICE'], os.environ['MODEL']
todo = []
for order, slug in enumerate(slugs):
    f = f'shared/narration/{slug}/lines.json'
    if not os.path.exists(f): continue
    for id_, v in json.load(open(f))['lines'].items():
        if v.get('audio') and os.path.exists(f'shared/narration/{slug}/lines/{id_}.mp3'): continue
        todo.append((v.get('priority', 1), order, slug, id_, v['text']))
todo.sort(key=lambda t: (t[0], t[1]))
need = sum(len(t[4]) for t in todo)
print(f'lines: {len(todo)} without audio, {need} characters; budget {budget}')
used = made = skipped = failed = 0
for pri, _, slug, id_, text in todo:
    if used + len(text) > budget: skipped += 1; continue
    body = json.dumps({'text': text, 'model_id': model, 'voice_settings': {'stability': 0.45, 'similarity_boost': 0.8, 'style': 0.35}}).encode()
    tmp = f'shared/narration/{slug}/.part.mp3'
    r = subprocess.run(['curl', '-s', '-o', tmp, '-w', '%{http_code}', '-X', 'POST',
                        f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128',
                        '-H', 'xi-api-key: ' + key, '-H', 'Content-Type: application/json', '--data-binary', '@-'],
                       input=body, capture_output=True)
    code = r.stdout.decode().strip()
    data = open(tmp, 'rb').read() if os.path.exists(tmp) else b''
    if os.path.exists(tmp): os.remove(tmp)
    if code != '200':
        print(f'FAIL {slug}/{id_}: HTTP {code} {data[:160]!r}'); failed += 1
        if code in ('401', '402', '429'): break
        continue
    if not (data[:3] == b'ID3' or (data[0] == 0xff and data[1] & 0xe0 == 0xe0)) or len(data) < 2000:
        print(f'FAIL {slug}/{id_}: not audio'); failed += 1; continue
    os.makedirs(f'shared/narration/{slug}/lines', exist_ok=True)
    open(f'shared/narration/{slug}/lines/{id_}.mp3', 'wb').write(data)
    f = f'shared/narration/{slug}/lines.json'
    d = json.load(open(f)); d['lines'][id_]['audio'] = True
    open(f, 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
    used += len(text); made += 1
print(f'lines: {made} MP3s, {used} characters used, {skipped} left on the browser voice (budget), {failed} failed')
sys.exit(1 if failed else 0)
PY
  curl -s -H "xi-api-key: $ELEVENLABS_API_KEY" https://api.elevenlabs.io/v1/user/subscription |
    python3 -c 'import sys,json; d=json.load(sys.stdin); print("quota after:", d.get("character_count"), "/", d.get("character_limit"))' || true
fi
exit $fail
