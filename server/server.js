// server/server.js
// Main Express + Socket.IO server

'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { loadAllSvgsFromFieldFolders } = require('./svgParser');
const { MatchmakingManager } = require('./matchmaking');

const PORT = process.env.PORT || 3000;
const FIELD_DIR = path.join(__dirname, '..', 'svg', 'field');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Load SVG data once at startup from themed field folders
console.log('[Server] Loading field SVG assets...');
const { svgData, byFolder } = loadAllSvgsFromFieldFolders(FIELD_DIR);
const folderNames = Object.keys(byFolder);
console.log(`[Server] Loaded ${Object.keys(svgData).length} field SVGs across ${folderNames.length} theme(s): ${folderNames.join(', ')}`);

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 30000,
  pingInterval: 10000
});

// Serve static files
app.use(express.static(PUBLIC_DIR));

// Serve /svg directory for field themes, lose images, etc.
app.use('/svg', express.static(path.join(__dirname, '..', 'svg')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', players: io.engine.clientsCount }));

// Initialize matchmaking
const mm = new MatchmakingManager(svgData, byFolder);

// Socket.IO events
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // Player joins matchmaking
  socket.on('join_matchmaking', async () => {
    try {
      await mm.addToQueue(socket);
    } catch (e) {
      console.error('[Matchmaking] Error:', e);
      socket.emit('error', { message: 'Failed to join matchmaking' });
    }
  });

  // Player cancels matchmaking
  socket.on('cancel_matchmaking', () => {
    mm.removeFromQueue(socket.id);
    socket.emit('matchmaking_cancelled', {});
  });

  // Player signals ready (after receiving map)
  socket.on('player_ready', () => {
    mm.handlePlayerReady(io, socket);
  });

  // Player sends position update
  socket.on('player_update', (data) => {
    mm.handlePlayerInput(io, socket, data);
  });

  // Player reached destination (client reports, server validates)
  socket.on('player_won', () => {
    mm.handlePlayerWin(io, socket);
  });

  // Player requests rematch
  socket.on('rematch_request', () => {
    mm.handleRematch(io, socket);
  });

  // Disconnect handling
  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
    mm.handleDisconnect(io, socket);
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n🎮 DoodleFour Race Server running on http://localhost:${PORT}`);
  console.log(`   Field themes: ${folderNames.join(', ')}`);
  console.log('   Waiting for players...\n');
});

module.exports = { app, io };
