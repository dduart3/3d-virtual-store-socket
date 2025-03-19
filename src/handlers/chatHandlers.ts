import { Server, Socket } from 'socket.io';
import { UserManager } from '../managers/UserManager';

export interface ChatMessage {
  id: string;
  sender: string;
  sender_id?: string;
  content: string;
  type: 'user' | 'system' | 'admin';
  timestamp: number;
  read?: boolean;
}

export function setupChatHandlers(io: Server, socket: Socket, userManager: UserManager) {
  // Handle chat messages
  socket.on('chat:message', (message: ChatMessage) => {
    const user = userManager.getUserBySocketId(socket.id);
    
    if (!user) return;
    
    // Validate and sanitize message
    if (!message.content || typeof message.content !== 'string') return;
    
    // Ensure message has correct metadata
    const validatedMessage: ChatMessage = {
      ...message,
      sender: user.username,
      sender_id: user.id,
      timestamp: Date.now(),
      type: message.type || 'user',
      read: false
    };
    
    // Broadcast message to all clients
    io.emit('chat:message', validatedMessage);
  });
  
  // Handle message read status
  socket.on('chat:read', (messageId: string) => {
    // This is handled client-side, but we could track it server-side if needed
    // For now, we just acknowledge the read status
    socket.emit('chat:read:ack', messageId);
  });
}
