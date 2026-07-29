import mongoose from "mongoose";

/**
 * Connects to MongoDB if not already connected/connecting. Safe to call on
 * every request — subsequent calls are no-ops while a connection is live,
 * which also handles dev hot-reload correctly without opening duplicate
 * connections.
 *
 * URI and dbName are parameters, not read from process.env here — env
 * ownership stays in apps/server where Feature 1 put it (Section 8 of the
 * brief). The server passes them in at startup; the seed script is the only
 * exception since it's a standalone CLI entry point.
 */
export async function connectCatalog(uri: string, dbName: string): Promise<void> {
  const state = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  if (state === 1 || state === 2) return;

  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
  });
}

export async function disconnectCatalog(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}
