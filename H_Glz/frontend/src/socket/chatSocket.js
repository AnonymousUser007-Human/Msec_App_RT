const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL ?? buildDefaultWebSocketUrl();

function buildDefaultWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/chat`;
}

export function createChatSocket({ onOpen, onClose, onMessage }) {
  let socket;

  return {
    connect() {
      socket = new WebSocket(WS_BASE_URL);
      socket.addEventListener('open', onOpen);
      socket.addEventListener('close', onClose);
      socket.addEventListener('message', (event) => onMessage(JSON.parse(event.data)));
    },
    disconnect() {
      socket?.close();
    },
    isConnected() {
      return socket?.readyState === WebSocket.OPEN;
    },
    send(message) {
      socket?.send(JSON.stringify(message));
    },
  };
}
