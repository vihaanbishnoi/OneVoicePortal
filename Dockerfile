FROM node:22-alpine AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY requirements-lock.txt ./
RUN pip install --no-cache-dir -r requirements-lock.txt
COPY backend/ ./backend/
COPY --from=frontend /build/frontend/dist ./frontend/dist
EXPOSE 5000
# One process owns periodic Gmail polling; threads handle concurrent API requests.
CMD ["sh", "-c", "exec gunicorn backend.app:app --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 240"]
