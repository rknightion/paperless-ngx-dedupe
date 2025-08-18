# =============================================================================
# Frontend Build Stage
# =============================================================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY frontend/package.json ./
COPY frontend/package-lock.json ./

# Install dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# =============================================================================
# Backend Build Stage
# =============================================================================
FROM python:3.13-slim AS backend-builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy project files
COPY pyproject.toml .
COPY README.md .
COPY src/ ./src/

# Install dependencies using uv
RUN uv pip install --system -e .

# =============================================================================
# Backend Production Stage
# =============================================================================
FROM python:3.13-slim AS backend

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 paperless && \
    mkdir -p /app/data /app/cache && \
    chown -R paperless:paperless /app

# Set working directory
WORKDIR /app

# Copy installed packages from backend builder
COPY --from=backend-builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Copy application code
COPY --chown=paperless:paperless src/ ./src/
COPY --chown=paperless:paperless pyproject.toml .
COPY --chown=paperless:paperless README.md .

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