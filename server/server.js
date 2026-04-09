import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fileUpload from 'express-fileupload';
import routes from './routes.js';
import dotenv from 'dotenv';
import { runMigration } from './migration_add_publication_ranges.js';

dotenv.config();

// ── Validate required environment variables at startup ────────────────────────
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
// F-16 FIX: Enforce minimum JWT secret length — short secrets are brute-forceable.
if (process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters long for security');
  process.exit(1);
}

const app = express();

// ── Trust Render's reverse proxy (required for correct IP-based rate limiting) ─
app.set('trust proxy', 1);

// ── Environment-based CORS configuration ─────────────────────────────────────
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [
        'https://xhrissun.github.io',
        'https://cron-job.org',
      ]
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
  optionsSuccessStatus: 200
};

// ── Global rate limiter (all routes) ─────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' }
});

// ── Auth-specific rate limiter (stricter) ─────────────────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please wait 15 minutes before trying again.' }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));
app.use(globalLimiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(fileUpload({
  limits: { fileSize: 5 * 1024 * 1024 },
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded',
  useTempFiles: false,
  tempFileDir: undefined
}));

// ── Connect to MongoDB and run migration ──────────────────────────────────────
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    console.log('\n🔄 Checking for pending migrations...');
    await runMigration();
    console.log('✅ Migration check complete\n');
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

startServer();

// ── Lightweight ping endpoint ─────────────────────────────────────────────────
app.get('/ping', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Ping received from ${req.ip}`);
  res.status(200).send('pong');
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check route (F-10 FIX: admin-only — prevents unauthenticated recon) ──
app.get('/health', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const jwt = (await import('jsonwebtoken')).default;
    const { User } = (await import('./models.js'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('userType');
    if (!user || user.userType !== 'admin')
      return res.status(403).json({ message: 'Access denied' });
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
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

// ── Root route (F-18 FIX: no endpoint map exposed to unauthenticated requests) ──
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

// ── Global error handling middleware ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.path}]`, err);
  res.status(500).json({
    message: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { error: err.message })
  });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Keep-alive endpoint: /ping`);
  console.log(`Health check endpoint: /health`);
});