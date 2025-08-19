# =============================================================================
# Frontend Build Stage
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better layer caching
COPY frontend/package.json frontend/package-lock.json ./

# Install dependencies (this layer will be cached if package files don't change)
RUN npm ci --only=production --silent

# Copy frontend source (separate layer for code changes)
COPY frontend/ ./

# Build frontend
RUN npm run build

# =============================================================================
# Backend Build Stage
# =============================================================================
FROM python:3.13-slim AS backend-builder

# Install build dependencies in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install uv (pinned version for reproducibility)
RUN pip install --no-cache-dir uv==0.5.1

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY pyproject.toml .
RUN touch README.md

# Install dependencies first (this layer will be cached if pyproject.toml doesn't change)
RUN uv pip install --system --no-cache .

# Copy source code (separate layer so code changes don't invalidate dependency cache)
COPY src/ ./src/

# =============================================================================
# Backend Production Stage
# =============================================================================
FROM python:3.13-slim AS backend

# Install runtime dependencies in a single optimized layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Create non-root user and directories in one layer
RUN useradd -m -u 1000 paperless && \
    mkdir -p /app/data /app/cache && \
    chown -R paperless:paperless /app

# Set working directory
WORKDIR /app

# Copy installed packages from backend builder (single layer)
COPY --from=backend-builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Copy application code
COPY --chown=paperless:paperless src/ ./src/
COPY --chown=paperless:paperless pyproject.toml .

# Switch to non-root user
USER paperless

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PAPERLESS_DEDUPE_DATA_DIR=/app/data \
    PAPERLESS_DEDUPE_CACHE_DIR=/app/cache

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "paperless_dedupe.main:app", "--host", "0.0.0.0", "--port", "8000"]

# =============================================================================
# Frontend Production Stage  
# =============================================================================
FROM nginx:alpine AS frontend

# Copy built assets from builder
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]