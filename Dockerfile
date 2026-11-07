# Static site: hub, shared menu and games, served by nginx on 8080 (see fly.toml).
FROM nginx:alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/site.conf
COPY index.html /usr/share/nginx/html/index.html
COPY shared/ /usr/share/nginx/html/shared/
COPY games/ /usr/share/nginx/html/games/
EXPOSE 8080
