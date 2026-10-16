# Build a partir da raiz do monorepo: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
# npm 10 tem um bug com workspaces + peer deps; o projeto usa npm 11.
RUN npm install -g npm@11
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci -w @checkins/shared -w @checkins/api --include-workspace-root --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @checkins/shared && npm run build -w @checkins/api \
  && npm prune --omit=dev -w @checkins/shared -w @checkins/api --include-workspace-root

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/package.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
