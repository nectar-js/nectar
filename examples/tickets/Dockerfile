# Build from the repository root, since the example depends on the workspace package:
#   docker build -f examples/tickets/Dockerfile -t tickets .
# A standalone project that installs @nectar-js/nectar from npm only needs the second stage.
# See the deployment guide.

FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# A self-contained copy of the example with its production dependencies resolved.
RUN pnpm deploy --filter tickets --prod --legacy /app

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app .
RUN node node_modules/@nectar-js/nectar/dist/cli.js build
VOLUME /app/data
ENV TICKETS_DB=/app/data/tickets.db
CMD ["node", ".nectar/start.mjs"]
