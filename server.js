const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let labState = { items: [] };

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Sync initial state on join
  socket.emit('init-state', labState.items);

  // Broadcast layout or state updates to all other clients
  socket.on('sync-state', (items) => {
    labState.items = items;
    socket.broadcast.emit('state-updated', items);
  });

  // Handle global experiment resets
  socket.on('reset-lab', (initialItems) => {
    labState.items = initialItems;
    io.emit('init-state', labState.items);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🧪 Virtual Chemistry Engine running on http://localhost:${PORT}`);
});