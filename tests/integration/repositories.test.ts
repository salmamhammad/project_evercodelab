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
      const coin = await coins.create('BTC', 'Bitcoin');
      expect(coin.id).toBeGreaterThan(0);
      expect(coin.symbol).toBe('BTC');
      expect(coin.name).toBe('Bitcoin');
      expect(coin.created_at).toBeDefined();
    });

    it('uppercases symbol on create', async () => {
      const coin = await coins.create('eth', 'Ethereum');
      expect(coin.symbol).toBe('ETH');
    });

    it('rejects duplicate symbols (UNIQUE constraint)', async () => {
      await coins.create('BTC', 'Bitcoin');
      await expect(coins.create('BTC', 'Bitcoin again')).rejects.toThrow();
    });

    it('findById returns the right coin', async () => {
      const created = await coins.create('SOL', 'Solana');
      const found = await coins.findById(created.id);
      expect(found?.symbol).toBe('SOL');
    });

    it('findById returns undefined for missing id', async () => {
      expect(await coins.findById(99999)).toBeUndefined();
    });

    it('findBySymbol is case-insensitive', async () => {
      await coins.create('ADA', 'Cardano');
      expect((await coins.findBySymbol('ada'))?.name).toBe('Cardano');
      expect((await coins.findBySymbol('ADA'))?.name).toBe('Cardano');
    });

    it('findAll returns coins ordered by id ASC', async () => {
      await coins.create('BTC', 'Bitcoin');
      await coins.create('ETH', 'Ethereum');
      await coins.create('SOL', 'Solana');
      const all = await coins.findAll();
      expect(all.map((c) => c.symbol)).toEqual(['BTC', 'ETH', 'SOL']);
    });

    it('update changes name and updated_at', async () => {
      const c = await coins.create('BTC', 'Bitcoin');
      const before = c.updated_at;
    //   the timeout make the updated_at absoltity after variable (before)
      await new Promise((r) => setTimeout(r, 1100));
      const u = await coins.update(c.id, 'BTC', 'Bitcoin Core');
      expect(u?.name).toBe('Bitcoin Core');
      expect(new Date(u!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });

    it('update returns undefined for missing id', async () => {
      expect(await coins.update(99999, 'X', 'X')).toBeUndefined();
    });

    it('delete removes the row and returns true', async () => {
      const c = await coins.create('BTC', 'Bitcoin');
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
      const c = await coins.create('BTC', 'Bitcoin');
      coinId = c.id;
    });

    it('inserts a price record', async () => {
      await prices.insert(coinId, 50000);
      const latest = await prices.getLatest(coinId);
      expect(latest?.price).toBe(50000);
      expect(latest?.coin_id).toBe(coinId);
    });

    it('getLatest returns undefined when no prices exist', async () => {
      expect(await prices.getLatest(coinId)).toBeUndefined();
    });

    it('getLatest returns the most recent one', async () => {
      await prices.insert(coinId, 100);
      await new Promise((r) => setTimeout(r, 1100));
      await prices.insert(coinId, 200);
      const latest = await prices.getLatest(coinId);
      expect(latest?.price).toBe(200);
    });

    it('findByCoinId respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await prices.insert(coinId, 1000 + i);
      }
      const limited = await prices.findByCoinId(coinId, 2);
      expect(limited).toHaveLength(2);
    });

    it('findByCoinId filters by from/to', async () => {
      await prices.insert(coinId, 100);
      await new Promise((r) => setTimeout(r, 1100));
      const mid = new Date().toISOString();
      await new Promise((r) => setTimeout(r, 1100));
      await prices.insert(coinId, 300);

      const after = await prices.findByCoinId(coinId, 10, mid);
      expect(after.map((p) => p.price)).toEqual([300]);

      const before = await prices.findByCoinId(coinId, 10, undefined, mid);
      expect(before.map((p) => p.price)).toEqual([100]);
    });

    it('cascades deletes when the parent coin is removed', async () => {
      await prices.insert(coinId, 50000);
      await coins.delete(coinId);
      expect(await prices.findByCoinId(coinId, 10)).toEqual([]);
    });
  });
});