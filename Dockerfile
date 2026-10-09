# Lab 3D + game đã build sẵn (./sync.sh) → phục vụ tĩnh bằng nginx
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY site /usr/share/nginx/html
EXPOSE 80
