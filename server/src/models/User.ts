import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    uid: { type: String, required: true, unique: true, index: true },
    email: { type: String, default: null },
    name: { type: String, default: null },
    preferredName: { type: String, default: null },
    username: { type: String, default: null },
    picture: { type: String, default: null },
    lastLoginAt: { type: Date, required: true }
  },
  { timestamps: true }
);

export type UserDocument = mongoose.InferSchemaType<typeof UserSchema>;

export const User = mongoose.models.User ?? mongoose.model("User", UserSchema);
