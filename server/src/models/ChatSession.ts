import mongoose from "mongoose";

const ChatSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true, unique: true },
    userId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    lastMessageAt: { type: Date, required: true }
  },
  { timestamps: true }
);

export type ChatSessionDocument = mongoose.InferSchemaType<typeof ChatSessionSchema>;

export const ChatSession =
  mongoose.models.ChatSession ??
  mongoose.model("ChatSession", ChatSessionSchema);
