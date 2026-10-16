import mongoose from 'mongoose';

export async function connectMongo(url: string): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(url, { serverSelectionTimeoutMS: 5_000 });
  return mongoose;
}

export function isMongoUp(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}
