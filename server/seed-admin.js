import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from './models.js';

// Load environment variables
dotenv.config();

async function createAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');



    // Admin users to create
    const adminUsers = [
      {
        name: 'System Administrator',
        email: 'admin@rater.com',
        password: 'admin123',
        position: 'System Administrator',
        designation: 'IT Administrator'
      },
      // Add more admin users here if needed
      // {
      //   name: 'HR Admin',
      //   email: 'hradmin@rater.com',
      //   password: 'hradmin123',
      //   position: 'HR Administrator',
      //   designation: 'Human Resources'
      // }
    ];

    for (const userData of adminUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`User with email ${userData.email} already exists, skipping...`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const adminUser = new User({
        name: userData.name,
        email: userData.email,
        password: hashedPassword,
        userType: 'admin',
        position: userData.position,
        designation: userData.designation,
        administrativePrivilege: true
      });

      await adminUser.save();
      console.log(`✅ Admin user created: ${userData.name}`);
      console.log(`   Email: ${userData.email}`);
      console.log(`   Password: ${userData.password}`);
      console.log('   ⚠️  Please change the password after first login!');
      console.log('');
    }

  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    // Close connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run the script
createAdminUser();