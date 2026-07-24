FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/dist ./server/dist
ENV PORT=8787
EXPOSE 8787
CMD ["node", "server/dist/index.js"]
