import mongoose from "mongoose";

export async function connectToDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required to connect to MongoDB.");
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}
