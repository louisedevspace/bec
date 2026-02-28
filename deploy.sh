#!/bin/bash
set -e

# ==========================================
#  Becxus Exchange - Linux/Mac Deploy Script
#  Usage: chmod +x deploy.sh && ./deploy.sh
# ==========================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Becxus Exchange - Deployment Script${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

# ------------------------------------------
# 1. Check Node.js
# ------------------------------------------
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed. Please install Node.js >= 18${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗ Node.js >= 18 required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

# ------------------------------------------
# 2. Check .env file
# ------------------------------------------
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo -e "${YELLOW}Copy .env.example to .env and fill in your values:${NC}"
    echo "  cp .env.example .env"
    echo ""
    echo "Required variables:"
    echo "  SUPABASE_URL=https://your-project.supabase.co"
    echo "  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    echo "  DATABASE_URL=postgresql://..."
    echo "  PORT=5050"
    exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"

# Load .env
set -a
source .env
set +a

# Check required env vars
MISSING=""
[ -z "$SUPABASE_URL" ] && MISSING="$MISSING SUPABASE_URL"
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && MISSING="$MISSING SUPABASE_SERVICE_ROLE_KEY"
[ -z "$DATABASE_URL" ] && MISSING="$MISSING DATABASE_URL"

if [ -n "$MISSING" ]; then
    echo -e "${RED}✗ Missing required environment variables:${MISSING}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Environment variables configured${NC}"

# ------------------------------------------
# 3. Install dependencies
# ------------------------------------------
echo ""
echo -e "${YELLOW}>> Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

# ------------------------------------------
# 4. Build for production
# ------------------------------------------
echo ""
echo -e "${YELLOW}>> Building for production...${NC}"

export NODE_ENV=production

# Build frontend with Vite
npx vite build
echo -e "${GREEN}  ✓ Frontend built${NC}"

# Bundle server with esbuild
npx esbuild server/index.ts \
    --platform=node \
    --packages=external \
    --bundle \
    --format=esm \
    --outdir=dist \
    --minify
echo -e "${GREEN}  ✓ Server bundled${NC}"

echo -e "${GREEN}✓ Production build complete${NC}"

# ------------------------------------------
# 5. Push database schema
# ------------------------------------------
echo ""
echo -e "${YELLOW}>> Pushing database schema...${NC}"
npx drizzle-kit push
echo -e "${GREEN}✓ Database schema synced${NC}"

# ------------------------------------------
# 6. Seed default data
# ------------------------------------------
echo ""
echo -e "${YELLOW}>> Seeding default data...${NC}"
npx tsx server/simple-seed.ts
echo -e "${GREEN}✓ Default data seeded${NC}"

# ------------------------------------------
# 7. Install PM2 if not available
# ------------------------------------------
if ! command -v pm2 &> /dev/null; then
    echo ""
    echo -e "${YELLOW}>> Installing PM2 globally...${NC}"
    npm install -g pm2
fi

# ------------------------------------------
# 8. Start/Restart with PM2
# ------------------------------------------
echo ""
echo -e "${YELLOW}>> Starting server with PM2...${NC}"

# Stop existing instance if running
pm2 delete tradebytes-exchange 2>/dev/null || true

# Start fresh
PORT=${PORT:-5050} NODE_ENV=production pm2 start dist/index.js \
    --name tradebytes-exchange \
    --time

# Save PM2 process list (survives reboots)
pm2 save

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}  ✓ Deployment Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo -e "  Server:    https://becxus.com"
echo -e "  API:       https://becxus.com/api"
echo -e "  WebSocket: wss://becxus.com/ws"
echo -e "  Port:      ${PORT:-5050}"
echo ""
echo -e "  ${CYAN}PM2 Commands:${NC}"
echo -e "    pm2 logs tradebytes-exchange     # View logs"
echo -e "    pm2 restart tradebytes-exchange   # Restart"
echo -e "    pm2 stop tradebytes-exchange      # Stop"
echo -e "    pm2 monit                         # Monitor"
echo -e "${GREEN}==========================================${NC}"
