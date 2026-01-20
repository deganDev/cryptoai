import mongoose from "mongoose";

const ChatTurnSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    prompt: { type: String, required: true },
    response: { type: Object, required: true }
  },
  { timestamps: true }
);

export type ChatTurnDocument = mongoose.InferSchemaType<typeof ChatTurnSchema>;

export const ChatTurn =
  mongoose.models.ChatTurn ?? mongoose.model("ChatTurn", ChatTurnSchema);
