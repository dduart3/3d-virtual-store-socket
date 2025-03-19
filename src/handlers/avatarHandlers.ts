import { Server, Socket } from 'socket.io';
import { UserManager } from '../managers/UserManager';

interface AvatarUpdate {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: number;
  isMoving: boolean;
  isRunning: boolean;
}

export function setupAvatarHandlers(io: Server, socket: Socket, userManager: UserManager) {
  // Handle avatar position updates
  socket.on('avatar:update', (update: AvatarUpdate) => {
    const user = userManager.getUserBySocketId(socket.id);
    
    if (!user) return;
    
    // Update user data
    userManager.updateUser(user.id, {
      position: update.position,
      rotation: update.rotation,
      isMoving: update.isMoving,
      isRunning: update.isRunning
    });
    
    // Broadcast update to all other clients
    socket.broadcast.emit('avatar:update', {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      position: update.position,
      rotation: update.rotation,
      isMoving: update.isMoving,
      isRunning: update.isRunning,
      timestamp: Date.now()
    });
  });
}
