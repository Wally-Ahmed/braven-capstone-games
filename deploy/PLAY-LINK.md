# Play link

**https://braven-capstone-games.onrender.com/**

Live on Render since Tue 2026-11-10, 11:48 PM EST (service srv-dbpv6lbrjlhs73b7djig, first deploy dep-dbpv6lrrjlhs73b7dkeg).
Join from a phone: https://braven-capstone-games.onrender.com/join/ with the 4-letter room code.
Front end and the /ws game relay are served from this one origin (the socket URL is built from location.host).
v8 lobbies: live Wed 2026-11-11, 12:30 AM EST (deploy dep-dbpvqn3l550s73948mgg, commit bc5c7a8).
Smoke test at deploy: /, /join/, /shield/, /games/phish-or-fine/, /healthz all returned 200; wss://.../ws upgrades.

Render free plan: spins down after 15 min idle, first load can take about a minute, 750 free instance hours a month.
Rooms live in memory, so a sleep, restart or redeploy resets every open room.

Redeploy: push to main, then trigger a deploy. The live service was created from the public Git URL through the API, so Render has no GitHub webhook on it and a push alone does nothing (verified 11/11 12:30 AM). Trigger from the Render dashboard (Manual Deploy) or with Composio `RENDER_TRIGGER_DEPLOY` on service srv-dbpv6lbrjlhs73b7djig. Connecting the GitHub repo inside Render would make pushes deploy on their own.
