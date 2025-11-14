# Multi-stage build for Node.js + Python service
FROM node:20-slim as node-base

# Install Python and pip for nba_api
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install Node.js dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Create Python virtual environment and install nba_api
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
COPY python-requirements.txt ./
RUN pip install --no-cache-dir -r python-requirements.txt

# Copy application code
COPY . .

# Copy and make wait script executable
COPY scripts/wait-for-services.sh /app/scripts/wait-for-services.sh
RUN chmod +x /app/scripts/wait-for-services.sh

# Install netcat for wait script (nc command)
RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Run tests - fail build if tests fail
RUN pnpm test --run

# Build TypeScript
RUN pnpm run build

# Expose ports
# 3000: Node.js service (if needed)
# 8000: Python HTTP bridge service
EXPOSE 3000 8000

# Set PYTHONPATH so Python can find the app module
ENV PYTHONPATH="/app/python-bridge:$PYTHONPATH"

# Start Python bridge service in background, wait for services, then Node.js service
CMD ["sh", "-c", "cd python-bridge && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 & sleep 2 && cd /app && /app/scripts/wait-for-services.sh && node dist/index.js"]

