import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { postChat, postChatStream } from "./routes/chat.js";
import { connectToDatabase } from "./db.js";
import { requireAuth } from "./middleware/auth.js";
import { getSessions, getSessionTurns } from "./routes/sessions.js";
import { getMe, updateMe } from "./routes/user.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 8080);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/api/chat", requireAuth, postChat);
app.post("/chat", requireAuth, postChat);
app.post("/api/chat/stream", requireAuth, postChatStream);
app.post("/chat/stream", requireAuth, postChatStream);
app.get("/api/sessions", requireAuth, getSessions);
app.get("/api/sessions/:sessionId", requireAuth, getSessionTurns);
app.get("/api/me", requireAuth, getMe);
app.patch("/api/me", requireAuth, updateMe);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

async function start() {
  await connectToDatabase();
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
