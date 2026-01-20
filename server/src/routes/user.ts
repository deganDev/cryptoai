import type { Request, Response } from "express";
import { User } from "../models/User.js";

type UserProfile = {
  name?: string;
  preferredName?: string;
  username?: string;
  email?: string;
  picture?: string;
};

export function getMe(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  User.findOne({ uid: req.user.uid })
    .lean()
    .then((user) => {
      const record = user as UserProfile | null;
      res.status(200).json({
        uid: req.user?.uid,
        name: record?.name ?? req.user?.name ?? null,
        preferredName: record?.preferredName ?? null,
        username: record?.username ?? null,
        email: record?.email ?? req.user?.email ?? null,
        picture: record?.picture ?? req.user?.picture ?? null
      });
    })
    .catch(() => {
      res.status(200).json({
        uid: req.user?.uid,
        name: req.user?.name ?? null,
        preferredName: null,
        username: null,
        email: req.user?.email ?? null,
        picture: req.user?.picture ?? null
      });
    });
}

export async function updateMe(req: Request, res: Response) {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { preferredName, username, name } = req.body as {
    preferredName?: string;
    username?: string;
    name?: string;
  };

  const updates: {
    preferredName?: string;
    username?: string;
    name?: string;
  } = {};

  if (typeof preferredName === "string") {
    updates.preferredName = preferredName.trim();
  }
  if (typeof username === "string") {
    updates.username = username.trim();
  }
  if (typeof name === "string") {
    updates.name = name.trim();
  }

  const user = await User.findOneAndUpdate(
    { uid: req.user.uid },
    { $set: updates },
    { new: true }
  );

  res.status(200).json({
    uid: req.user.uid,
    name: user?.name ?? req.user.name,
    preferredName: user?.preferredName ?? null,
    username: user?.username ?? null,
    email: user?.email ?? req.user.email,
    picture: user?.picture ?? req.user.picture
  });
}
