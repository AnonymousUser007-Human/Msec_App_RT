import { createServer } from "http";
import { Server } from "socket.io";
import app from "./app.js";
import { env } from "./config/env.js";
import { setSocketIO } from "./sockets/io.js";
import { registerSocketHandlers } from "./sockets/socket.server.js";

const httpServer = createServer(app);

const socketCors =
  env.CORS_ORIGIN === "*"
    ? { origin: true }
    : {
        origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
        credentials: true as const,
      };

const io = new Server(httpServer, {
  cors: socketCors,
});

setSocketIO(io);
registerSocketHandlers(io);

httpServer.listen(env.PORT, () => {
  console.log(`API + Socket.IO sur le port ${env.PORT}`);
});
