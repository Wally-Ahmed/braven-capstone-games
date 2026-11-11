# Play link

**https://braven-capstone-games.onrender.com/**

Live on Render since Tue 2026-11-10, 11:48 PM EST (service srv-dbpv6lbrjlhs73b7djig, first deploy dep-dbpv6lrrjlhs73b7dkeg).
Join from a phone: https://braven-capstone-games.onrender.com/join/ with the 4-letter room code.
Front end and the /ws game relay are served from this one origin (the socket URL is built from location.host).
v8 lobbies: live Wed 2026-11-11, 12:30 AM EST (deploy dep-dbpvqn3l550s73948mgg, commit bc5c7a8).
Smoke test at deploy: /, /join/, /shield/, /games/phish-or-fine/, /healthz all returned 200; wss://.../ws upgrades.

Render free plan: spins down after 15 min idle, first load can take about a minute, 750 free instance hours a month.
Rooms live in memory, so a sleep, restart or redeploy resets every open room.

Redeploy: push to main. autoDeploy is on, so Render builds the Dockerfile and goes live by itself.
