import { io } from "socket.io-client";
import { API_URL, getAuthToken } from "./api";

let socket;
export function getSocket() {
  if (!socket) {
    socket = io(API_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
  }
  socket.auth = { token: getAuthToken() };
  if (!socket.connected) socket.connect();
  return socket;
}

export function closeSocket() {
  if (socket) socket.disconnect();
}
