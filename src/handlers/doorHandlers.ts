import { Server, Socket } from 'socket.io';
import { UserManager } from '../managers/UserManager';

// Track the current door state
let doorState: 'open' | 'closed' = 'closed';

export function setupDoorHandlers(io: Server, socket: Socket, userManager: UserManager) {
  // Send initial door state to newly connected user
  socket.emit('door:state', doorState);
 
  // Add a handler for requesting door state
  socket.on('door:getState', () => {
    // Send the current door state to the requesting client
    socket.emit('door:state', doorState);
  });

  // Handle door state change requests
  socket.on('door:toggle', () => {
    const user = userManager.getUserBySocketId(socket.id);
   
    if (!user) return;
   
    // Toggle door state
    doorState = doorState === 'closed' ? 'open' : 'closed';
   
    // Log the action
    console.log(`Door ${doorState} by ${user.username} (${user.id})`);
   
    // Broadcast new state to all clients
    io.emit('door:state', doorState);
   
    // Optionally send a system message to chat
    const doorMessage = {
      id: `system-door-${Date.now()}`,
      sender: 'Sistema',
      content: `${user.username} ha ${doorState === 'open' ? 'abierto' : 'cerrado'} la puerta.`,
      type: 'system',
      timestamp: Date.now()
    };
   
    io.emit('chat:message', doorMessage);
  });
}
