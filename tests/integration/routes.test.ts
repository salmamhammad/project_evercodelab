
import request from 'supertest';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { initDb, closeDb, getDb } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { CoinRepository } from '../../src/repositories/CoinRepository';
import { PriceRepository } from '../../src/repositories/PriceRepository';
import { CoinService } from '../../src/services/CoinService';
import { MockCoinMarketCapService } from '../helpers/mockCmc';

const API_KEY = 'test-api-key';
const auth = { Authorization: `Bearer ${API_KEY}` };

describe('HTTP routes (integration via Supertest)', () => {
  let app: Express;
  let cmc: MockCoinMarketCapService;
  let service: CoinService;
  let coins: CoinRepository;
  let prices: PriceRepository;

  beforeAll(async () => {
    await initDb();
    await runMigrations();
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    await new Promise<void>((resolve, reject) => {
      getDb().exec(
        'DELETE FROM price_history; DELETE FROM coins; DELETE FROM task_runs;',
        (err) => (err ? reject(err) : resolve())
      );
    });

    coins = new CoinRepository();
    prices = new PriceRepository();
    cmc = new MockCoinMarketCapService();
    service = new CoinService(coins, prices, cmc as any);
    app = createApp({ service });
  });

  // Public
  describe('GET /health', () => {
    it('returns ok without auth', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  // Auth
  describe('Auth middleware', () => {
    it('rejects requests without a Bearer token (negative)', async () => {
      const res = await request(app).get('/api/coins');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UnauthorizedError');
    });

    it('rejects requests with a wrong token (negative)', async () => {
      const res = await request(app).get('/api/coins').set('Authorization', 'Bearer nope');
      expect(res.status).toBe(401);
    });

    it('accepts requests with the correct token (positive)', async () => {
      const res = await request(app).get('/api/coins').set(auth);
      expect(res.status).toBe(200);
    });
  });

  // GET /api/coins
  describe('GET /api/coins', () => {
    it('returns an empty array initially (positive)', async () => {
      const res = await request(app).get('/api/coins').set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all tracked coins (positive)', async () => {
      await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      await request(app).post('/api/coins').set(auth).send({ symbol: 'ETH' });

      const res = await request(app).get('/api/coins').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.map((c: any) => c.symbol)).toEqual(['BTC', 'ETH']);
    });
  });

  // POST /api/coins
  describe('POST /api/coins', () => {
    it('creates a coin and records its first price (positive)', async () => {
      const res = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        symbol: 'BTC',
        cmc_id: 1,
        name: 'Bitcoin',
        last_updated_at: '2026-10-05T18:00:00.000Z',
      });

      const history = await prices.findByCoinId(res.body.id, 10);
      expect(history).toHaveLength(1);
      expect(history[0].price).toBe(50000);
    });

    it('normalizes lowercase symbols (positive)', async () => {
      const res = await request(app).post('/api/coins').set(auth).send({ symbol: 'btc' });
      expect(res.status).toBe(201);
      expect(res.body.symbol).toBe('BTC');
      expect(cmc.calls).toEqual(['symbol:BTC']);
    });

    it('accepts a custom name override (positive)', async () => {
      const res = await request(app)
        .post('/api/coins')
        .set(auth)
        .send({ symbol: 'BTC', name: 'Bitcoin (custom)' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Bitcoin (custom)');
    });

    it('rejects missing symbol (negative)', async () => {
      const res = await request(app).post('/api/coins').set(auth).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('rejects empty symbol (negative)', async () => {
      const res = await request(app).post('/api/coins').set(auth).send({ symbol: '' });
      expect(res.status).toBe(400);
    });

    it('rejects symbols with digits (negative)', async () => {
      const res = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC1' });
      expect(res.status).toBe(400);
    });

    it('rejects overly long name (negative)', async () => {
      const res = await request(app)
        .post('/api/coins')
        .set(auth)
        .send({ symbol: 'BTC', name: 'x'.repeat(101) });
      expect(res.status).toBe(400);
    });

    it('returns 404 when CMC does not know the symbol (negative)', async () => {
      const res = await request(app).post('/api/coins').set(auth).send({ symbol: 'FAKE' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFoundError');
    });

    it('returns 409 when the symbol is already tracked (negative)', async () => {
      await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ConflictError');
    });

    it('returns 502 when CMC is unreachable (negative)', async () => {
      cmc.shouldFail = true;
      const res = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      expect(res.status).toBe(502);
      expect(res.body.error).toBe('ExternalApiError');
    });

    it('rejects unauthenticated requests (negative)', async () => {
      const res = await request(app).post('/api/coins').send({ symbol: 'BTC' });
      expect(res.status).toBe(401);
    });
  });

  // GET /api/coins/:id
  describe('GET /api/coins/:id', () => {
    it('returns the coin (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app).get(`/api/coins/${created.body.id}`).set(auth);

      expect(res.status).toBe(200);
      expect(res.body.symbol).toBe('BTC');
      expect(res.body.cmc_id).toBe(1);
    });

    it('returns 400 for a non-numeric id (negative)', async () => {
      const res = await request(app).get('/api/coins/abc').set(auth);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
    });

    it('returns 400 for a zero or negative id (negative)', async () => {
      const res = await request(app).get('/api/coins/0').set(auth);
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown id (negative)', async () => {
      const res = await request(app).get('/api/coins/99999').set(auth);
      expect(res.status).toBe(404);
    });
  });

  // PUT /api/coins/:id
  describe('PUT /api/coins/:id', () => {
    it('renames a coin (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .put(`/api/coins/${created.body.id}`)
        .set(auth)
        .send({ name: 'Bitcoin Core' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Bitcoin Core');
      expect(res.body.symbol).toBe('BTC');   // symbol is immutable
      expect(res.body.cmc_id).toBe(1);       // cmc_id is immutable
    });

    it('returns 400 for missing name (negative)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .put(`/api/coins/${created.body.id}`)
        .set(auth)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 400 for empty name (negative)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .put(`/api/coins/${created.body.id}`)
        .set(auth)
        .send({ name: '   ' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown id (negative)', async () => {
      const res = await request(app)
        .put('/api/coins/99999')
        .set(auth)
        .send({ name: 'Anything' });
      expect(res.status).toBe(404);
    });
  });

  // DELETE /api/coins/:id
  describe('DELETE /api/coins/:id', () => {
    it('deletes a coin and returns 204 (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app).delete(`/api/coins/${created.body.id}`).set(auth);
      expect(res.status).toBe(204);
      expect(res.body).toEqual({});

      // Verify it is actually gone
      const check = await request(app).get(`/api/coins/${created.body.id}`).set(auth);
      expect(check.status).toBe(404);
    });

    it('cascades to price history (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const historyBefore = await prices.findByCoinId(created.body.id, 10);
      expect(historyBefore.length).toBeGreaterThan(0);

      await request(app).delete(`/api/coins/${created.body.id}`).set(auth);

      const historyAfter = await prices.findByCoinId(created.body.id, 10);
      expect(historyAfter).toEqual([]);
    });

    it('returns 404 for an unknown id (negative)', async () => {
      const res = await request(app).delete('/api/coins/99999').set(auth);
      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid id (negative)', async () => {
      const res = await request(app).delete('/api/coins/abc').set(auth);
      expect(res.status).toBe(400);
    });
  });

  // GET /api/coins/:id/current
  describe('GET /api/coins/:id/current', () => {
    it('returns the current price from CMC (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app).get(`/api/coins/${created.body.id}/current`).set(auth);

      expect(res.status).toBe(200);
      expect(res.body.price).toBe(50000);
      expect(res.body.currency).toBe('USD');
      expect(res.body.coin.symbol).toBe('BTC');

      expect(cmc.calls).toEqual(['symbol:BTC', 'id:1']);
    });

    it('records a new history row per call (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      await request(app).get(`/api/coins/${created.body.id}/current`).set(auth);
      await request(app).get(`/api/coins/${created.body.id}/current`).set(auth);

      const history = await prices.findByCoinId(created.body.id, 10);
      // 1 initial price from POST + 2 from the /current calls
      expect(history).toHaveLength(3);
    });

    it('returns 404 for an untracked coin (negative)', async () => {
      const res = await request(app).get('/api/coins/99999/current').set(auth);
      expect(res.status).toBe(404);
    });

    it('returns 502 when CMC fails (negative)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      cmc.shouldFail = true;
      const res = await request(app).get(`/api/coins/${created.body.id}/current`).set(auth);
      expect(res.status).toBe(502);
    });
  });

  // GET /api/coins/:id/history
  describe('GET /api/coins/:id/history', () => {
    it('returns stored history with currency (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .get(`/api/coins/${created.body.id}/history?limit=10`)
        .set(auth);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      for (const row of res.body) {
        expect(row.currency).toBe('USD');
        expect(row.coin_id).toBe(created.body.id);
      }
    });

    it('honors the limit query parameter (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      await request(app).get(`/api/coins/${created.body.id}/current`).set(auth);
      await request(app).get(`/api/coins/${created.body.id}/current`).set(auth);

      const res = await request(app)
        .get(`/api/coins/${created.body.id}/history?limit=2`)
        .set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('honors from/to date filters (positive)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });

      const future = new Date(Date.now() + 86_400_000).toISOString();   // tomorrow
      const farFuture = new Date(Date.now() + 2 * 86_400_000).toISOString(); // after tomorrow

      // for future window no rows should match
      const empty = await request(app)
        .get(`/api/coins/${created.body.id}/history?from=${future}&to=${farFuture}`)
        .set(auth);
      expect(empty.status).toBe(200);
      expect(empty.body).toEqual([]);

      // for wide window all rows should match
      const past = new Date(Date.now() - 86_400_000).toISOString();
      const wide = await request(app)
        .get(`/api/coins/${created.body.id}/history?from=${past}&to=${farFuture}`)
        .set(auth);
      expect(wide.body.length).toBeGreaterThan(0);
    });

    it('returns 400 for an invalid limit (negative)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .get(`/api/coins/${created.body.id}/history?limit=99999`)
        .set(auth);
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-numeric limit (negative)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .get(`/api/coins/${created.body.id}/history?limit=abc`)
        .set(auth);
      expect(res.status).toBe(400);
    });

    it('returns 400 when from is later than to (negative)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .get(
          `/api/coins/${created.body.id}/history?from=2026-10-05T00:00:00Z&to=2026-10-01T00:00:00Z`
        )
        .set(auth);
      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid date string (negative)', async () => {
      const created = await request(app).post('/api/coins').set(auth).send({ symbol: 'BTC' });
      const res = await request(app)
        .get(`/api/coins/${created.body.id}/history?from=not-a-date`)
        .set(auth);
      expect(res.status).toBe(400);
    });

    it('returns 404 for an untracked coin (negative)', async () => {
      const res = await request(app).get('/api/coins/99999/history').set(auth);
      expect(res.status).toBe(404);
    });
  });

  // 404 for unknown routes
  describe('Unknown routes', () => {
    it('returns 404 JSON for a non-existent path (negative)', async () => {
      const res = await request(app).get('/api/does-not-exist').set(auth);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NotFound');
    });
  });
});