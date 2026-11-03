FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=frontend /build/frontend/dist ./frontend/dist
EXPOSE 5000
# One Node process serves the API and owns periodic Gmail polling.
CMD ["node", "server/index.js"]
