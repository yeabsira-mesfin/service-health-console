FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
COPY package*.json ./
RUN npm ci
COPY app ./app
COPY lib ./lib
COPY next.config.mjs ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3102 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY scripts ./scripts
COPY lib ./lib
RUN mkdir -p data && chown node:node data
USER node
EXPOSE 3102
CMD ["node", "server.js"]
