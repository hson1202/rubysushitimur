import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import userModel from '../models/userModel.js';

dotenv.config();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD is not set');
}

const createAdmin = async () => {
  try {
    const mongoUrl = process.env.MONGODB_URL || process.env.MONGODB_URI;
    if (!mongoUrl) {
      throw new Error('MONGODB_URL is not set');
    }

    const dbName = process.env.MONGODB_DBNAME;
    await mongoose.connect(mongoUrl, dbName ? { dbName } : {});
    console.log('Connected to MongoDB');

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const existingUser = await userModel.findOne({ email: ADMIN_EMAIL });

    if (existingUser) {
      existingUser.password = hashedPassword;
      existingUser.role = 'admin';
      existingUser.status = 'active';
      existingUser.name = existingUser.name || ADMIN_NAME;
      await existingUser.save();
      console.log('Admin user updated successfully!');
    } else {
      await userModel.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        role: 'admin',
        status: 'active'
      });
      console.log('Admin user created successfully!');
    }

    console.log(`Email: ${ADMIN_EMAIL}`);

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

createAdmin();
