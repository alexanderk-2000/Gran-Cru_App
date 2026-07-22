import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { registerHealthRoute } from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const REQUEST_TIMEOUT = Number(process.env.REQUEST_TIMEOUT || 30000);

app.use(
  cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setTimeout(REQUEST_TIMEOUT, () => {
    res.status(408).json({ success: false, error: 'Request timeout' });
  });
  next();
});

registerHealthRoute(app, () => ({
  status: 'ok',
  mode: 'local-only',
  external_ai: false,
  timestamp: new Date().toISOString(),
}));

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

export { app };

export const startServer = () =>
  app.listen(PORT, () => {
    console.log(`🍷 Wine Vault server running in local-only mode on http://localhost:${PORT}`);
  });
