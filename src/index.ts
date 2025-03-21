import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupChatHandlers } from './handlers/chatHandlers';
import { setupAvatarHandlers } from './handlers/avatarHandlers';
import { setupOnlineUsersHandlers } from './handlers/onlineUsersHandlers';
import { UserManager } from './managers/UserManager';
import compression from 'compression';
import { setupDoorHandlers } from './handlers/doorHandlers';

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
app.use(cors());
app.use(compression() as any); // Add compression for HTTP responses

const server = http.createServer(app);

// Create Socket.IO server with compression
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST']
  },
  // Enable WebSocket compression
  perMessageDeflate: {
    threshold: 1024, // Only compress messages larger than 1KB
    zlibDeflateOptions: {
      chunkSize: 16 * 1024 // Use larger chunks for better compression
    },
    zlibInflateOptions: {
      chunkSize: 16 * 1024
    }
  }
});

// Create user manager (single source of truth for connected users)
const userManager = new UserManager();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedUsers: userManager.getUserCount(),
    uptime: process.uptime()
  });
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  
  // Extract user data from auth
  const userId = socket.handshake.auth.userId;
  const username = socket.handshake.auth.username || 'Usuario';
  const avatarUrl = socket.handshake.auth.avatarUrl || 'https://readyplayerme.github.io/visage/male.glb';
  
  if (!userId) {
    console.log('Connection rejected: Missing userId');
    socket.disconnect();
    return;
  }
  
  // Register user with manager
  userManager.addUser({
    id: userId,
    socketId: socket.id,
    username,
    avatarUrl,
    position: { x: -165, y: 0, z: -59 },
    rotation: 0,
    isMoving: false,
    isRunning: false,
    lastSeen: Date.now()
  });
  
  // Broadcast join event to all clients
  const joinMessage = {
    id: `system-join-${userId}-${Date.now()}`,
    sender: 'Sistema',
    content: `${username} ha entrado.`,
    type: 'system',
    timestamp: Date.now()
  };
  
  io.emit('chat:message', joinMessage);
  
  // Send initial state to new user
  socket.emit('users:initial', userManager.getAllUsers());
  
  // Broadcast updated user count
  io.emit('users:count', userManager.getUserCount());

    // Broadcast updated online users list to all clients
    io.emit('online_users', userManager.getAllUsers().map(user => ({
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl
    })));
  
  // Set up feature-specific handlers
  setupChatHandlers(io, socket, userManager);
  setupAvatarHandlers(io, socket, userManager);
  setupOnlineUsersHandlers(io, socket, userManager);
  setupDoorHandlers(io, socket, userManager);
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const user = userManager.getUserBySocketId(socket.id);
    
    if (user) {
      console.log(`User disconnected: ${user.username} (${user.id})`);
      
      // Remove user from manager
      userManager.removeUser(user.id);
      
      // Broadcast leave event
      const leaveMessage = {
        id: `system-leave-${user.id}-${Date.now()}`,
        sender: 'Sistema',
        content: `${user.username} ha salido.`,
        type: 'system',
        timestamp: Date.now()
      };
      
      io.emit('chat:message', leaveMessage);
      io.emit('user:disconnect', user.id);
      
      // Broadcast updated user count
      io.emit('users:count', userManager.getUserCount());

       // Broadcast updated online users list
       io.emit('online_users', userManager.getAllUsers().map(user => ({
        userId: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl
      })));
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
