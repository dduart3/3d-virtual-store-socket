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
      
      // Create a new buffer with user ID
      const userIdBuffer = new ArrayBuffer(16 + 4); // 16 bytes for update + 4 bytes for user ID
      const userIdView = new DataView(userIdBuffer);
      
      // Copy the original update data
      const originalView = new DataView(buffer);
      for (let i = 0; i < 16 && i < buffer.byteLength; i++) {
        userIdView.setUint8(i, originalView.getUint8(i));
      }
      
      // Add user ID as a 32-bit integer at the end
      // Note: This is a simplified approach. In a real implementation,
      // you might want to use a string ID and a more robust encoding.
      userIdView.setUint32(16, parseInt(user.id, 10) || 0, true);
      
      // Broadcast binary update to all other clients
      socket.broadcast.emit('avatar:update', userIdBuffer);
    } catch (error) {
      console.error('Error processing avatar update:', error);
    }
  });
}
