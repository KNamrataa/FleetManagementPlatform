const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Keep connection-pool settings configurable so deployments can tune them
    // without changing application code. Defaults preserve MongoDB/Mongoose's
    // usual pool capacity while reclaiming idle sockets.
    const connection = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: Math.max(1, Number(process.env.MONGO_MAX_POOL_SIZE) || 100),
      minPoolSize: Math.max(0, Number(process.env.MONGO_MIN_POOL_SIZE) || 0),
      maxIdleTimeMS: Math.max(1000, Number(process.env.MONGO_MAX_IDLE_TIME_MS) || 30000),
      serverSelectionTimeoutMS: Math.max(
        1000,
        Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000
      ),
    });

    console.log(
      `MongoDB connected: ${connection.connection.host}/${connection.connection.name}`
    );
  } catch (error) {
    console.error(
      `MongoDB connection error: ${error.message}`
    );

    process.exit(1);
  }
};

module.exports = connectDB;
