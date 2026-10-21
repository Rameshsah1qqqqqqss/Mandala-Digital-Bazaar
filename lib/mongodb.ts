import mongoose, { type Connection } from 'mongoose';

interface MongooseCache {
  conn: Connection | null;
  promise: Promise<Connection> | null;
  lastError: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mandalaMongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis.__mandalaMongooseCache || {
  conn: null,
  promise: null,
  lastError: null,
};

if (!globalThis.__mandalaMongooseCache) {
  globalThis.__mandalaMongooseCache = cached;
}

export function isMongoUriConfigured(): boolean {
  const uri = process.env.MONGODB_URI;
  return Boolean(uri && uri.trim().startsWith('mongodb'));
}

/**
 * Connects to MongoDB Atlas using a cached serverless-safe connection pool.
 * Never exposes connection strings or credentials in error messages.
 */
export async function connectToMongoDB(): Promise<Connection | null> {
  if (!isMongoUriConfigured()) {
    return null;
  }

  if (cached.conn && cached.conn.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const uri = process.env.MONGODB_URI as string;
    cached.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      })
      .then((m) => {
        cached.lastError = null;
        return m.connection;
      })
      .catch((err: unknown) => {
        cached.promise = null;
        cached.lastError =
          err instanceof Error ? 'MongoDB Atlas connection failed. Verify MONGODB_URI and IP network access.' : 'Database connection error';
        throw new Error(cached.lastError);
      });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch {
    return null;
  }
}

/**
 * Executes a critical multi-document financial or inventory workflow inside a
 * MongoDB replica-set transaction when connected to MongoDB Atlas.
 */
export async function withMongoTransaction<T>(
  operation: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  const conn = await connectToMongoDB();
  if (!conn) {
    return operation(null);
  }
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
