import { Server, Socket } from 'socket.io';
import { UserManager } from '../managers/UserManager';
import { BinaryProtocol } from '../utils/BinaryProtocol';

// Rate limiting settings
const RATE_LIMIT = {
  minTimeBetweenUpdates: 50 // ms
};

// Track last update time for each user
const lastUpdateTime: Record<string, number> = {};

export function setupAvatarHandlers(io: Server, socket: Socket, userManager: UserManager) {
  // Handle binary avatar position updates
  socket.on('avatar:update', (data: any) => {
    const user = userManager.getUserBySocketId(socket.id);
    if (!user) return;
    
    // Apply rate limiting
    const now = Date.now();
    if (lastUpdateTime[user.id] && now - lastUpdateTime[user.id] < RATE_LIMIT.minTimeBetweenUpdates) {
      return; // Ignore too frequent updates
    }
    lastUpdateTime[user.id] = now;
    
    // Convert data to ArrayBuffer if it's not already
    // Socket.IO might send the binary data in different formats
    let buffer: ArrayBuffer;
    
    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (Buffer.isBuffer(data)) {
      // Node.js Buffer to ArrayBuffer
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else if (Array.isArray(data)) {
      // Handle array of bytes
      buffer = new Uint8Array(data).buffer;
    } else {
      console.error('Received invalid data format for avatar update:', typeof data);
      return;
    }
    
    try {
      // Decode binary update
      const update = BinaryProtocol.decodeAvatarUpdate(buffer);
      
      // Update user data
      userManager.updateUser(user.id, {
        position: update.position,
        rotation: update.rotation,
        isMoving: update.isMoving,
        isRunning: update.isRunning
      });
      
      // Instead of trying to encode the UUID in the binary message,
      // send a regular JSON object with the binary data and user ID
      socket.broadcast.emit('avatar:update', {
        userId: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        data: buffer
      });
    } catch (error) {
      console.error('Error processing avatar update:', error);
    }
  });
}
