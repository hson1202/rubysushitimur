import mongoose from "mongoose";

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    // Support both env names to avoid configuration mismatches
    const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI;
    if (!mongoUrl) {
      throw new Error(
        "MONGODB_URL/MONGODB_URI is not set in environment variables"
      );
    }

    // Clean connection string - remove appName if exists
    const cleanMongoUrl = mongoUrl.replace(/[?&]appName=[^&]*/g, '').replace(/[?&]$/, '');

    const dbName = process.env.MONGODB_DBNAME;

    // Connect with timeout and retry options
    await mongoose.connect(cleanMongoUrl, {
      ...(dbName ? { dbName } : {}),
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority'
    });
    
    // Set mongoose options
    mongoose.set('bufferCommands', false);
    mongoose.set('strictQuery', true);
    
    console.log("✅ DB Connected Successfully");
    return true;
  } catch (error) {
    console.error("❌ Database connection error:", error);

    // Don't exit on production - let it retry on next request
    if (process.env.NODE_ENV === "production") {
      console.error("Production mode: Will retry connection on next request");
      return false;
    }

    // Only exit on local development
    process.exit(1);
  }
};
