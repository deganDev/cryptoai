import type { Request, Response } from "express";
import { ChatSession } from "../models/ChatSession.js";
import { ChatTurn } from "../models/ChatTurn.js";

export async function getSessions(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const sessions = await ChatSession.find({ userId: req.user.uid })
    .sort({ lastMessageAt: -1 })
    .select("sessionId title lastMessageAt")
    .lean();

  res.status(200).json({ sessions });
}

export async function getSessionTurns(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { sessionId } = req.params;
  const turns = await ChatTurn.find({ userId: req.user.uid, sessionId })
    .sort({ createdAt: 1 })
    .select("prompt response createdAt")
    .lean();

  res.status(200).json({ sessionId, turns });
}
