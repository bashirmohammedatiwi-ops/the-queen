# The Queen — المتجر الإلكتروني (حاوية مستقلة تماماً عن باقي تطبيقات السيرفر)
FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./
COPY public ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "--no-warnings", "server.mjs"]
