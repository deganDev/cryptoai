import { TTLCache } from "./cache.js";
import type { Intent } from "../types.js";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  intent?: Intent;
  timestamp: string;
};

export type ConversationState = {
  sessionId: string;
  turns: ChatTurn[];
  lastQuery?: string;
  lastAddress?: string;
  lastChain?: string;
};

const MAX_TURNS = 40;
const cache = new TTLCache(6 * 60 * 60 * 1000);

export function getConversation(sessionId: string): ConversationState {
  const cached = cache.get<ConversationState>(sessionId);
  if (cached) {
    return cached;
  }
  const state: ConversationState = { sessionId, turns: [] };
  cache.set(sessionId, state);
  return state;
}

export function appendTurn(sessionId: string, turn: ChatTurn): void {
  const state = getConversation(sessionId);
  state.turns.push(turn);
  if (state.turns.length > MAX_TURNS) {
    state.turns = state.turns.slice(-MAX_TURNS);
  }
  cache.set(sessionId, state);
}

export function updateConversation(
  sessionId: string,
  updates: Partial<ConversationState>
): ConversationState {
  const state = getConversation(sessionId);
  const next: ConversationState = { ...state, ...updates };
  cache.set(sessionId, next);
  return next;
}
