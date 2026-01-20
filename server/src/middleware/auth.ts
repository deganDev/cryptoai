import type { Request, Response, NextFunction } from "express";
import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { User } from "../models/User.js";

function initFirebaseAdmin() {
  if (getApps().length) {
    return;
  }
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID
  });
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    res.status(401).json({ error: "Missing auth token." });
    return;
  }

  try {
    initFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(match[1]);
    req.user = {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null
    };
    await User.findOneAndUpdate(
      { uid: decoded.uid },
      {
        $set: {
          email: decoded.email ?? null,
          picture: decoded.picture ?? null,
          lastLoginAt: new Date()
        },
        $setOnInsert: {
          uid: decoded.uid,
          name: decoded.name ?? null
        }
      },
      { upsert: true }
    );
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid auth token." });
  }
}
