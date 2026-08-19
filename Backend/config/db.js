import mongoose from "mongoose";

mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false);

let connecting = null;

const logConnectionError = (error) => {
  console.error("❌ Database connection error:", error.message);
  if (error.reason?.message) {
    console.error("   Reason:", error.reason.message);
  }
  console.error(
    "   Check: 1) MongoDB Atlas → Network Access allows 0.0.0.0/0  2) MONGODB_URL + MONGODB_DBNAME on Render  3) cluster is not paused"
  );
};

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  if (connecting) {
    return connecting;
  }

  connecting = (async () => {
    try {
      const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI;
      if (!mongoUrl) {
        throw new Error(
          "MONGODB_URL/MONGODB_URI is not set in environment variables"
        );
      }

      const cleanMongoUrl = mongoUrl
        .replace(/[?&]appName=[^&]*/g, "")
        .replace(/[?&]$/, "");

      const dbName = process.env.MONGODB_DBNAME;

      await mongoose.connect(cleanMongoUrl, {
        ...(dbName ? { dbName } : {}),
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
      });

      console.log("✅ DB Connected Successfully");
      return true;
    } catch (error) {
      logConnectionError(error);

      if (mongoose.connection.readyState !== 0) {
        try {
          await mongoose.disconnect();
        } catch {
          // ignore disconnect errors so the next request can retry cleanly
        }
      }

      if (process.env.NODE_ENV === "production") {
        console.error("Production mode: Will retry connection on next request");
        return false;
      }

      process.exit(1);
    } finally {
      connecting = null;
    }
  })();

  return connecting;
};
