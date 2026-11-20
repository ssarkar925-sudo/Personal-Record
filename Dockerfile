FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=10000
ENV HOST=0.0.0.0
ENV RENDER=true
ENV AUTO_WAKEUP=true

EXPOSE 10000

CMD ["node", "--experimental-strip-types", "--experimental-sqlite", "server/index.ts"]
