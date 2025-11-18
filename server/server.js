import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import routes from './routes.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();

// Environment-based CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://xhrissun.github.io',
        'https://cron-job.org',
        //'https://your-domain.com' // Add your custom domain if you have one
      ]
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload middleware
app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded',
  useTempFiles: false,
  tempFileDir: undefined
}));

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Lightweight ping endpoint - Place FIRST for fastest response
app.get('/ping', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Ping received from ${req.ip}`);
  res.status(200).send('pong');
});

// Routes
app.use('/api', routes);

// Health check route
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  res.status(200).json({ 
    status: 'OK', 
    message: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'Rater System API Server',
    version: '1.0.0',
    endpoints: ['/api', '/health', '/ping']
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { error: err.message })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Keep-alive endpoint: /ping`);
  console.log(`Health check endpoint: /health`);
  
  // Initialize background workers after server starts
  startBackgroundWorkers();
});

// ============================================
// BACKGROUND WORKERS - Keep server active
// ============================================

function startBackgroundWorkers() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Background Workers] Skipped in development mode');
    return;
  }

  console.log('[Background Workers] Starting keep-alive tasks...');

  // Worker 1: Database Health Check (every 10 minutes)
  const dbHealthCheck = setInterval(async () => {
    try {
      await mongoose.connection.db.admin().ping();
      const timestamp = new Date().toISOString();
      console.log(`[Worker-DB] Health check completed at ${timestamp}`);
    } catch (error) {
      console.error('[Worker-DB] Error:', error.message);
    }
  }, 10 * 60 * 1000); // 10 minutes

  // Worker 2: Memory Usage Monitor (every 12 minutes)
  const memoryMonitor = setInterval(() => {
    const used = process.memoryUsage();
    const timestamp = new Date().toISOString();
    console.log(`[Worker-Memory] ${timestamp} - RSS: ${Math.round(used.rss / 1024 / 1024)}MB, Heap: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);
  }, 12 * 60 * 1000); // 12 minutes

  // Worker 3: Connection Status Check (every 14 minutes)
  const connectionCheck = setInterval(() => {
    const timestamp = new Date().toISOString();
    const status = {
      mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
      uptime: Math.floor(process.uptime()),
      timestamp
    };
    console.log('[Worker-Status]', JSON.stringify(status));
  }, 14 * 60 * 1000); // 14 minutes

  // Graceful shutdown handling
  const cleanup = () => {
    console.log('[Background Workers] Shutting down...');
    clearInterval(dbHealthCheck);
    clearInterval(memoryMonitor);
    clearInterval(connectionCheck);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  console.log('[Background Workers] ✓ All workers started successfully');
}
