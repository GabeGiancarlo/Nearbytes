#!/bin/bash

# NearBytes Demo Setup Script
# This script sets up and starts both the backend and UI servers for a demo

set -e

echo "🚀 NearBytes Demo Setup"
echo "========================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version 18+ required. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) detected${NC}"

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "📦 Step 1: Installing dependencies..."
echo "--------------------------------------"

# Install backend dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
else
    echo -e "${GREEN}✅ Backend dependencies already installed${NC}"
fi

# Install UI dependencies
if [ ! -d "ui/node_modules" ]; then
    echo "Installing UI dependencies..."
    cd ui
    npm install
    cd ..
else
    echo -e "${GREEN}✅ UI dependencies already installed${NC}"
fi

echo ""
echo "🔨 Step 2: Building backend..."
echo "--------------------------------"

# Build the backend
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please check the errors above.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Backend built successfully${NC}"

echo ""
echo "🔍 Step 3: Checking ports..."
echo "--------------------------------"

# Check if ports are available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${YELLOW}⚠️  Port $port is already in use${NC}"
        read -p "Kill the process using port $port? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            kill -9 $(lsof -ti:$port) 2>/dev/null || true
            sleep 1
            echo -e "${GREEN}✅ Port $port is now available${NC}"
        else
            echo -e "${RED}❌ Cannot proceed. Please free port $port manually.${NC}"
            exit 1
        fi
    else
        echo -e "${GREEN}✅ Port $port is available${NC}"
    fi
}

check_port 4321
check_port 5173

echo ""
echo "🚀 Step 4: Starting servers..."
echo "--------------------------------"

# Create data directory if it doesn't exist
mkdir -p data

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}🛑 Shutting down servers...${NC}"
    kill $BACKEND_PID $UI_PID 2>/dev/null || true
    wait $BACKEND_PID $UI_PID 2>/dev/null || true
    echo -e "${GREEN}✅ Servers stopped${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend server
echo "Starting backend server on port 4321..."
PORT=4321 npm run server > /tmp/nearbytes-backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}❌ Backend server failed to start${NC}"
    echo "Backend log:"
    cat /tmp/nearbytes-backend.log
    exit 1
fi

echo -e "${GREEN}✅ Backend server started (PID: $BACKEND_PID)${NC}"

# Start UI dev server
echo "Starting UI dev server on port 5173..."
cd ui
npm run dev > /tmp/nearbytes-ui.log 2>&1 &
UI_PID=$!
cd ..

# Wait for UI to start
sleep 5

# Check if UI started successfully
if ! kill -0 $UI_PID 2>/dev/null; then
    echo -e "${RED}❌ UI dev server failed to start${NC}"
    echo "UI log:"
    cat /tmp/nearbytes-ui.log
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

echo -e "${GREEN}✅ UI dev server started (PID: $UI_PID)${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}✅ Demo is ready!${NC}"
echo "=========================================="
echo ""
echo "🌐 Backend: http://localhost:4321"
echo "🎨 UI:      http://localhost:5173"
echo ""
echo "📝 Quick Start:"
echo "   1. Open http://localhost:5173 in your browser"
echo "   2. Enter a secret in the address field (e.g., 'demo123')"
echo "   3. Drag and drop files to add them"
echo "   4. Click × to delete files"
echo ""
echo "📚 For more information, see:"
echo "   - ui/UI_EXPLANATION.md (detailed explanation)"
echo "   - ui/QUICK_START.md (quick reference)"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the servers${NC}"
echo ""

# Wait for user interrupt
wait
