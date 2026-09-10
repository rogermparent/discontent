FROM node:22.14.0-alpine3.21@sha256:9bef0ef1e268f60627da9ba7d7605e8831d5b56ad07487d24d1aa386336d1944
WORKDIR /app

RUN apk update
RUN apk add git

RUN git config --global user.name "Docker Tester"
RUN git config --global user.email "docker@example.com"

# Copy relevent monorepo package.json files
COPY package.json /app/package.json
COPY pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY pnpm-lock.yaml /app/pnpm-lock.yaml
COPY packages/cms/package.json /app/packages/cms/package.json
COPY packages/menus-collection/package.json /app/packages/menus-collection/package.json
COPY packages/pages-collection/package.json /app/packages/pages-collection/package.json
COPY packages/component-library/package.json /app/packages/component-library/package.json
COPY packages/next-static-image/package.json /app/packages/next-static-image/package.json
COPY packages/projects-collection/package.json /app/packages/projects-collection/package.json
COPY websites/recipe-website/common/package.json /app/websites/recipe-website/common/package.json
COPY websites/recipe-website/editor/package.json /app/websites/recipe-website/editor/package.json
COPY websites/recipe-website/export/package.json /app/websites/recipe-website/export/package.json

# Enable pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile
COPY . .
CMD ["sh"]
