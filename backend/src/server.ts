import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { explainRouter } from './routes/explain.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173';

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'itag-backend' });
});

app.use('/api/explain', explainRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[itag-backend] listening on http://localhost:${PORT}`);
});
