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
    let buffer: ArrayBuffer;
    
    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (Buffer.isBuffer(data)) {
      buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } else if (Array.isArray(data)) {
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
      
      // Create a combined buffer with position data and UUID
      // Format: [16 bytes position data][16 bytes UUID]
      
      // Convert UUID to bytes
      const uuidBytes = BinaryProtocol.uuidToBytes(user.id);
      
      // Create the combined buffer (32 bytes total)
      const combinedBuffer = new ArrayBuffer(32);
      const combinedView = new DataView(combinedBuffer);
      
      // Copy position data (first 16 bytes)
      const originalView = new DataView(buffer);
      for (let i = 0; i < 16; i++) {
        combinedView.setUint8(i, originalView.getUint8(i));
      }
      
      // Copy UUID (next 16 bytes)
      for (let i = 0; i < 16; i++) {
        combinedView.setUint8(16 + i, uuidBytes[i]);
      }
      
      // Broadcast the combined buffer
      socket.broadcast.emit('avatar:update', combinedBuffer);
    } catch (error) {
      console.error('Error processing avatar update:', error);
    }
  });
}
