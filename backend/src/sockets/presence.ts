const userToSockets = new Map<string, Set<string>>();

export function trackSocketConnect(userId: string, socketId: string): boolean {
  let set = userToSockets.get(userId);
  if (!set) {
    set = new Set();
    userToSockets.set(userId, set);
  }
  const first = set.size === 0;
  set.add(socketId);
  return first;
}

export function trackSocketDisconnect(userId: string, socketId: string): boolean {
  const set = userToSockets.get(userId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size === 0) {
    userToSockets.delete(userId);
    return true;
  }
  return false;
}
