// ============================================================================
// Q-Dispatch — main server
// Quantum AI Ltd. | quantumai.co.uk
// ============================================================================

import { loadEnv } from './env';
loadEnv();

import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { initDb } from './db';
import { seedIfEmpty } from './seed';
import { seedFullDemoIfEmpty } from './demoSeed';
import { startCron } from './cron';
import { requireLogin, loginPage, loginPost, logout } from './middleware/auth';
import { getLastPolledAt } from './inbox';
import claimsRouter from './routes/claims';
import auditRouter from './routes/audit';
import dispatchRouter from './routes/dispatch';
import inboxRouter from './routes/inbox';
import clearanceRouter from './routes/clearance';
import ledgerRouter from './routes/ledger';
import insightsRouter from './routes/insights';
import hisRouter from './routes/his';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// --- Auth routes (public) ---------------------------------------------------
app.get('/login', loginPage);
app.post('/api/auth/login', loginPost);
app.post('/api/auth/logout', logout);

// --- Protect everything below -----------------------------------------------
app.use(requireLogin);

// --- Static frontend --------------------------------------------------------
app.use(express.static(path.join(__dirname, '../public')));

// --- API routes -------------------------------------------------------------
app.use('/api/claims', claimsRouter);
app.use('/api', auditRouter);
app.use('/api', dispatchRouter);
app.use('/api', inboxRouter);
app.use('/api', clearanceRouter);
app.use('/api', hisRouter);
app.use('/api/ledger', ledgerRouter);
app.use('/api/insights', insightsRouter);

app.get('/api/health', (_req, res) =>
  res.json({
    status: 'ok',
    version: '1.0.0',
    product: 'Q-Dispatch',
    last_polled_at: getLastPolledAt(),
  })
);

// --- Catch-all → serve index.html -------------------------------------------
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, '../public/index.html'))
);

// --- Bootstrap --------------------------------------------------------------
initDb();
// SEED_DEMO=full seeds a complete demo roster (every stage + decision path);
// otherwise just the single spec demo claim. Both only seed when DB is empty.
if (process.env.SEED_DEMO === 'full') {
  seedFullDemoIfEmpty();
} else {
  seedIfEmpty();
}
startCron();

app.listen(PORT, () =>
  console.log(`Q-Dispatch running on port ${PORT}`)
);
