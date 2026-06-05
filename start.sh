#!/bin/bash
# Start Alphabet Globe - runs both server and client

echo "🌍 Starting Alphabet Globe..."

# Start backend
echo "📡 Starting backend server..."
cd server && npm install --silent && node index.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Start frontend
echo "⚛️  Starting React frontend..."
cd ../client && npm install --silent && npm start &
CLIENT_PID=$!

echo ""
echo "✅ Alphabet Globe is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Handle shutdown
trap "echo '🛑 Shutting down...'; kill $SERVER_PID $CLIENT_PID 2>/dev/null" EXIT
wait
