import express from 'express';
import dotenv from 'dotenv';

import routes from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import { checkDbConnection } from './db/prisma';
import path from 'path/win32';
// import { prisma } from './db/prisma.js';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.join(process.cwd(), '.env') });
console.log('Loaded .env? ORS_API_KEY =', process.env.ORS_API_KEY);
console.log('All env keys:', Object.keys(process.env).filter(k => k.includes('ORS') || k.includes('PORT')));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

app.use('/api/v1', routes);

app.get('/health', async (_req, res) => {
  const dbConnected = await checkDbConnection();
  res.json({
    status: 'ok',
    db: dbConnected ? 'connected' : 'disconnected',
    uptime_s: Math.floor(process.uptime()),
  });
});
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 Route Optimization Service running on http://localhost:${PORT}`);
});