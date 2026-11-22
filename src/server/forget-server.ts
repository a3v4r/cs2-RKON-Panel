import { clearChat } from './chat-log';
import { clearLive } from './live';
import { clearJoins } from './players';

// Server IDs are reused (the next new server gets the highest ID + 1), so what the panel keeps per server ID
// (live match, chat history, join history) is dropped when a server is deleted and again when one is created.
export function forgetServer(id: number) {
  clearLive(id);
  clearChat(id);
  clearJoins(id);
}
