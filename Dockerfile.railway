FROM node:24-bookworm-slim

WORKDIR /app

COPY . .

WORKDIR /app/server

RUN npm ci --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npm", "start"]
