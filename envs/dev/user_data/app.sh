#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx

cat >/var/www/html/index.html <<HTML
<html>
  <head><title>HashiCorp Lab</title></head>
  <body>
    <h1>HashiCorp Enterprise Lab</h1>
    <p>Environment: ${environment}</p>
    <p>Port: ${app_port}</p>
  </body>
</html>
HTML

sed -i "s/listen 80 default_server;/listen ${app_port} default_server;/" /etc/nginx/sites-available/default
sed -i "s/listen \\[::\\]:80 default_server;/listen [::]:${app_port} default_server;/" /etc/nginx/sites-available/default
systemctl enable nginx
systemctl restart nginx

