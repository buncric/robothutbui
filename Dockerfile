# Dựng lab 3D + game (Vite) rồi phục vụ tĩnh bằng nginx
FROM node:20-alpine AS build
WORKDIR /src
COPY lab/package.json lab/package-lock.json lab/
RUN cd lab && npm ci --no-audit --no-fund
COPY lab lab
# laptop trong game đọc ../docs/*.md lúc build
COPY docs docs
RUN cd lab && npx vite build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/lab/dist /usr/share/nginx/html
EXPOSE 80
