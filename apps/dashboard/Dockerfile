FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# NEXT_PUBLIC_ vars must be set at build time — they get baked into the JS bundle
ARG NEXT_PUBLIC_SKIP_AUTH=true
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SKIP_AUTH=$NEXT_PUBLIC_SKIP_AUTH
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Standalone output may be nested under monorepo path
COPY --from=builder /app/.next/standalone/ ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# If built inside monorepo, server.js is nested
RUN if [ -f apps/dashboard/server.js ]; then \
      cp -r apps/dashboard/* . && \
      cp -r apps/dashboard/.next ./ 2>/dev/null || true && \
      rm -rf apps; \
    fi

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
