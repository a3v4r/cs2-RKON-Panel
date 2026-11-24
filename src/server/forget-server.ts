import { clearChat } from './chat-log';
import { clearLive } from './live';
import { clearJoins } from './players';

// server IDs are reused (max + 1): drop per-ID state on delete and again on create
export function forgetServer(id: number) {
  clearLive(id);
  clearChat(id);
  clearJoins(id);
}
