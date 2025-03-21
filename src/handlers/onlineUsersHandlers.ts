import { Server, Socket } from 'socket.io';
import { UserManager } from '../managers/UserManager';

export function setupOnlineUsersHandlers(io: Server, socket: Socket, userManager: UserManager) {
  // Handle request for online users list
  socket.on('get_online_users', () => {
    const users = userManager.getAllUsers().map(user => ({
      userId: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl
    }));
    
    // Send online users to the requesting client
    socket.emit('online_users', users);
  });
  
  // You could add more online user related handlers here
  // For example, user status updates, user profile updates, etc.
}
