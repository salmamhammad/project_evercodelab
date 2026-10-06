import { initDb, closeDb, getDb } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { CoinRepository } from '../../src/repositories/CoinRepository';
import { PriceRepository } from '../../src/repositories/PriceRepository';

describe('Repositories (integration, in-memory SQLite)', () => {
  const coins = new CoinRepository();
  const prices = new PriceRepository();

  beforeAll(async () => {
    await initDb();
    await runMigrations();
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    // Clean price_history between tests
    await new Promise<void>((resolve, reject) => {
      getDb().exec(
        'DELETE FROM price_history; DELETE FROM coins; DELETE FROM task_runs;',
        (err) => (err ? reject(err) : resolve())
      );
    });
  });

  // CoinRepository 
  describe('CoinRepository', () => {
    it('creates a coin and returns it with an id', async () => {
      const coin = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        lastUpdatedAt: '2026-10-05T18:00:00.000Z',
      });
      expect(coin.id).toBeGreaterThan(0);
      expect(coin.symbol).toBe('BTC');
      expect(coin.name).toBe('Bitcoin');
      expect(coin.last_updated_at).toBe('2026-10-05T18:00:00.000Z');
    });

    it('rejects duplicate cmc_id', async () => {
      await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      await expect(
        coins.create({ cmcId: 1, symbol: 'BTC2', name: 'Bitcoin Fork' })
      ).rejects.toThrow();
    });

    it('rejects duplicate symbol', async () => {
      await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      await expect(
        coins.create({ cmcId: 999, symbol: 'BTC', name: 'Fake BTC' })
      ).rejects.toThrow();
    });

    it('findById returns the right coin', async () => {
      const created = await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      const found = await coins.findById(created.id);
      expect(found?.symbol).toBe('BTC');
    });

    it('findById returns undefined for missing id', async () => {
      expect(await coins.findById(99999)).toBeUndefined();
    });

    it('findBySymbol is case-insensitive', async () => {
      await coins.create({ cmcId: 1, symbol: 'ADA', name: 'Cardano' });
      expect((await coins.findBySymbol('ada'))?.name).toBe('Cardano');
      expect((await coins.findBySymbol('ADA'))?.name).toBe('Cardano');
    });

    it('findAll returns coins ordered by id ASC', async () => {
      await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      await coins.create({ cmcId: 2, symbol: 'ETH', name: 'Ethereum' });
      await coins.create({ cmcId: 3, symbol: 'SOL', name: 'Solana' });
      const all = await coins.findAll();
      expect(all.map((c) => c.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
    });

   it('updateName changes only the name', async () => {
      const c = await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      const u = await coins.updateName(c.id, 'Bitcoin Core');
      expect(u?.name).toBe('Bitcoin Core');
      expect(u?.symbol).toBe('BTC');
      expect(u?.cmc_id).toBe(1);
    });

    it('updateName returns undefined for missing id', async () => {
      expect(await coins.updateName(99999, 'X')).toBeUndefined();
    });

    it('touchLastUpdated changes last_updated_at', async () => {
      const c = await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      await coins.touchLastUpdated(c.id, '2026-10-05T20:00:00.000Z');
      const refreshed = await coins.findById(c.id);
      expect(refreshed?.last_updated_at).toBe('2026-10-05T20:00:00.000Z');
    });

    it('delete removes the row and returns true', async () => {
      const c = await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      expect(await coins.delete(c.id)).toBe(true);
      expect(await coins.findById(c.id)).toBeUndefined();
    });

    it('delete returns false for missing id', async () => {
      expect(await coins.delete(99999)).toBe(false);
    });
  });

  //  PriceRepository 
  describe('PriceRepository', () => {
    let coinId: number;
    beforeEach(async () => {
      const c = await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      coinId = c.id;
    });

    it('inserts a price with currency', async () => {
      await prices.insert(coinId, 50000, 'USD');
      const latest = await prices.getLatest(coinId);
      expect(latest?.price).toBe(50000);
    });

    it('getLatest returns undefined when no prices exist', async () => {
      expect(await prices.getLatest(coinId)).toBeUndefined();
    });

    it('getLatest returns the most recent one', async () => {
      await prices.insert(coinId, 100, 'USD');
      await new Promise((r) => setTimeout(r, 1100));
      await prices.insert(coinId, 200, 'USD');
      const latest = await prices.getLatest(coinId);
      expect(latest?.price).toBe(200);
    });

    it('findByCoinId respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await prices.insert(coinId, 1000 + i, 'USD');
      }
      const limited = await prices.findByCoinId(coinId, 2);
      expect(limited).toHaveLength(2);
    });

    it('findByCoinId filters by from/to', async () => {
      await prices.insert(coinId, 100, 'USD');
      await new Promise((r) => setTimeout(r, 1100));
      const mid = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 1100));
      await prices.insert(coinId, 300, 'USD');

      const after = await prices.findByCoinId(coinId, 10, mid);
      expect(after.map((p) => p.price)).toEqual([300]);

      const before = await prices.findByCoinId(coinId, 10, undefined, mid);
      expect(before.map((p) => p.price)).toEqual([100]);
    });

    it('cascades deletes when the parent coin is removed', async () => {
      await prices.insert(coinId, 50000, 'USD');
      await coins.delete(coinId);
      expect(await prices.findByCoinId(coinId, 10)).toEqual([]);
    });
  });
});