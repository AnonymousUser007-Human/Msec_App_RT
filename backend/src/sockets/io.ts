import type { Server } from "socket.io";

let io: Server | null = null;

export function setSocketIO(server: Server): void {
  io = server;
}

export function getSocketIO(): Server | null {
  return io;
}
