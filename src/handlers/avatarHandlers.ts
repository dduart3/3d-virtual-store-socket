import { Server, Socket } from 'socket.io';
import { UserManager } from '../managers/UserManager';

// Keep using your original avatar handler but add the binary optimization
export function setupAvatarHandlers(io: Server, socket: Socket, userManager: UserManager) {
  // Handle avatar position updates (original JSON format)
  socket.on('avatar:update', (update: any) => {
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
