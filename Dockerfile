# Demo server image. Build and run (from the project root):
#   docker build -t regulars-crm:local .
#   docker run --rm -p 8806:8790 -e REGULARS_DEMO_MODE=1 -e REGULARS_HASH_SALT=<salt> regulars-crm:local
# Node 24 strips TypeScript types natively, so src/main.ts runs without tsx or a build step.
# Health check endpoint: /health (Cloud Run does not pass /healthz to the app).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV PORT=8790 REGULARS_DATA_DIR=/app/data TZ=Asia/Seoul
EXPOSE 8790
# Exec form with no empty arguments: Cloud Run drops empty exec-form arguments.
CMD ["node", "src/main.ts"]
