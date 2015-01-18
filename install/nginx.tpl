server {
    listen       80;
    server_name  {{serverName}};
{% if sslDir %}
    # redirect all http traffic to https
    rewrite      ^ https://$server_name$request_uri? permanent;
}

server {
    listen 443;
    server_name {{serverName}};

    ssl on;
    ssl_certificate     {{sslDir}}/server.crt;
    ssl_certificate_key {{sslDir}}/server.key;
{% endif %}

    access_log  {{logDir}}/access-queue.log;
    error_log   {{logDir}}/error-queue.log;

    location / {
        proxy_pass http://127.0.0.1:{{appPort}};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
