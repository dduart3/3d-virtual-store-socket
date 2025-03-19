export interface User {
    id: string;
    socketId: string;
    username: string;
    avatarUrl: string;
    position: {
      x: number;
      y: number;
      z: number;
    };
    rotation: number;
    isMoving: boolean;
    isRunning: boolean;
    lastSeen: number;
  }
  
  export class UserManager {
    private users: Map<string, User> = new Map();
    
    addUser(user: User): void {
      this.users.set(user.id, user);
    }
    
    getUser(userId: string): User | undefined {
      return this.users.get(userId);
    }
    
    getUserBySocketId(socketId: string): User | undefined {
      return Array.from(this.users.values()).find(user => user.socketId === socketId);
    }
    
    updateUser(userId: string, updates: Partial<User>): void {
      const user = this.getUser(userId);
      if (user) {
        this.users.set(userId, { ...user, ...updates, lastSeen: Date.now() });
      }
    }
    
    removeUser(userId: string): void {
      this.users.delete(userId);
    }
    
    getAllUsers(): User[] {
      return Array.from(this.users.values());
    }
    
    getUserCount(): number {
      return this.users.size;
    }
  }  