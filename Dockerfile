# this is the multi stage build , like it will make our container very light. Instead of using node:22-alpine we just pack all those in light node engine
FROM node:22-alpine AS deps

WORKDIR /app

# this line for the prisma, prisma needs openssl on Alpine, the container will build but fail on boot if this line is removed
RUN apk add --no-cache openssl libc6-compat

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci



FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma

COPY . .

RUN npx prisma generate && npm run build 



FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl libc6-compat wget

RUN addgroup -S appgroup && adduser -S appuser -G appgroup


COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/main"]


FROM deps AS dev

WORKDIR /app

COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma


CMD [ "npm" , "run", "start:dev" ]