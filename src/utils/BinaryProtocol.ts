// Binary protocol for position updates
export class BinaryProtocol {
    // Encode position update to binary
    static encodeAvatarUpdate(update: {
      position: { x: number; y: number; z: number };
      rotation: number;
      isMoving: boolean;
      isRunning: boolean;
    }): ArrayBuffer {
      // 3 floats (position) + 1 float (rotation) + 2 booleans = 16 bytes
      const buffer = new ArrayBuffer(16);
      const view = new DataView(buffer);
      
      // Position (12 bytes)
      view.setFloat32(0, update.position.x, true);
      view.setFloat32(4, update.position.y, true);
      view.setFloat32(8, update.position.z, true);
      
      // Rotation (4 bytes)
      view.setFloat32(12, update.rotation, true);
      
      // Pack booleans into the last byte
      const flags = (update.isMoving ? 1 : 0) | (update.isRunning ? 2 : 0);
      view.setUint8(15, flags);
      
      return buffer;
    }
    
    // Decode binary to position update
    static decodeAvatarUpdate(buffer: ArrayBuffer): {
      position: { x: number; y: number; z: number };
      rotation: number;
      isMoving: boolean;
      isRunning: boolean;
    } {
      const view = new DataView(buffer);
      
      // Extract position
      const position = {
        x: view.getFloat32(0, true),
        y: view.getFloat32(4, true),
        z: view.getFloat32(8, true)
      };
      
      // Extract rotation
      const rotation = view.getFloat32(12, true);
      
      // Extract flags
      const flags = view.getUint8(15);
      const isMoving = (flags & 1) !== 0;
      const isRunning = (flags & 2) !== 0;
      
      return {
        position,
        rotation,
        isMoving,
        isRunning
      };
    }
  }
  