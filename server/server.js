import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fileUpload from 'express-fileupload';
import routes from './routes.js';
import dotenv from 'dotenv';
import { initSocket } from './lib/socket.js';
// import { runMigration } from './migration_add_publication_ranges.js';

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

// ── Email (Resend) is required for 2FA OTP codes, admin password-setup ────────
// invites, and self-service password resets to actually reach users. Not
// fatal on its own — server.js still boots for local dev without it — but
// every affected request will fail loudly (see server/lib/email.js) until
// these are set.
if (!process.env.RESEND_API_KEY) {
  console.warn('WARNING: RESEND_API_KEY is not set — OTP, password-setup, and password-reset emails will NOT be sent.');
}
if (!process.env.FRONTEND_URL) {
  console.warn('WARNING: FRONTEND_URL is not set — password setup/reset email links will be malformed.');
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
  exposedHeaders: ['X-Refresh-Token'],
  optionsSuccessStatus: 200
};

// ── Global rate limiter (all routes) ─────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const resetMs = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : Date.now() + 15 * 60 * 1000;
    console.warn(`[rate-limit] GLOBAL 429 ${req.method} ${req.originalUrl} ip=${req.ip} xff="${req.headers['x-forwarded-for'] || ''}"`);
    res.status(429).json({
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED_GLOBAL',
      retryAfterSeconds: Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))
    });
  }
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

// ── Auth request log ─────────────────────────────────────────────────────────
// One line per /api/auth/* call (method, path, status, duration, IP, origin —
// never bodies, passwords, or tokens). Registered BEFORE the global limiter so
// rate-limited requests show up too. Makes "users can't log in but there are
// no logs" diagnosable: you can now see whether requests arrive, from which
// IP (as Express sees it), and how they were answered.
app.use('/api/auth', (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(
      `[auth] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${Date.now() - started}ms ` +
      `ip=${req.ip} xff="${req.headers['x-forwarded-for'] || ''}" origin="${req.headers.origin || ''}"`
    );
  });
  next();
});

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
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000
    });
    console.log('Connected to MongoDB');
    // console.log('\n🔄 Checking for pending migrations...');
    // await runMigration();
    // console.log('✅ Migration check complete\n');
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

startServer();

// ── Lightweight ping endpoint ─────────────────────────────────────────────────
app.get('/ping', (req, res) => {
  const timestamp = new Date().toISOString();
  // Heap is logged here because the keep-alive runs on a fixed interval,
  // which makes the Render log itself a usable memory trace: a healthy
  // process sawtooths around a stable baseline, while a leak shows as a
  // monotonic climb. This is what lets a future OOM be diagnosed from the
  // log alone instead of guessing.
  const { heapUsed, rss } = process.memoryUsage();
  const mb = (bytes) => Math.round(bytes / 1024 / 1024);
  console.log(
    `[${timestamp}] Ping received from ${req.ip} — heap ${mb(heapUsed)}MB, rss ${mb(rss)}MB, up ${Math.floor(process.uptime() / 3600)}h`
  );
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
// app.listen() (Express's shorthand) implicitly creates its own http.Server
// under the hood — but Socket.IO needs a reference to that server to attach
// to, so it's created explicitly here instead and Express is mounted onto it
// as its request handler. Functionally identical to app.listen() for every
// existing REST route; this only changes what's needed to also serve chat's
// WebSocket connections on the same port.
const httpServer = http.createServer(app);
initSocket(httpServer, corsOptions);

const PORT = process.env.PORT || 5001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`Keep-alive endpoint: /ping`);
  console.log(`Health check endpoint: /health`);
});