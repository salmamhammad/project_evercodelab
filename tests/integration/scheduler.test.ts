import { initDb, closeDb, getDb } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { CoinRepository } from '../../src/repositories/CoinRepository';
import { PriceRepository } from '../../src/repositories/PriceRepository';
import { TaskScheduler } from '../../src/services/TaskScheduler';
import { ExternalApiError, NotFoundError } from '../../src/errors/AppError';

// Mock CoinMarketCap service
class MockCoinMarketCapService {
  public calls: number[] = [];
  public shouldFailFor: Set<number> = new Set();
  public priceById: Record<number, number> = { 1: 50000, 1027: 3000 };
  public lastUpdated = '2026-10-05T18:00:00.000Z';
  public delayMs = 0;

  async getQuoteById(id: number) {
    this.calls.push(id);

    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }

    if (this.shouldFailFor.has(id)) {
      throw new ExternalApiError(`mock failure for id ${id}`);
    }

    const price = this.priceById[id];
    if (price === undefined) {
      throw new NotFoundError(`id ${id} unknown`);
    }

    return {
      cmcId: id,
      symbol: id === 1 ? 'BTC' : 'ETH',
      name: id === 1 ? 'Bitcoin' : 'Ethereum',
      price,
      currency: 'USD',
      lastUpdated: this.lastUpdated,
    };
  }
}

// Test suite
describe('TaskScheduler (integration, real DB + mocked CMC)', () => {
  let coins: CoinRepository;
  let prices: PriceRepository;
  let cmc: MockCoinMarketCapService;
  let scheduler: TaskScheduler;

  beforeAll(async () => {
    await initDb();
    await runMigrations();
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    // Clean state between tests
    await new Promise<void>((resolve, reject) => {
      getDb().exec(
        'DELETE FROM price_history; DELETE FROM coins; DELETE FROM task_runs;',
        (err) => (err ? reject(err) : resolve())
      );
    });

    coins = new CoinRepository();
    prices = new PriceRepository();
    cmc = new MockCoinMarketCapService();
    scheduler = new TaskScheduler(coins, prices, cmc as any);
  });

  afterEach(async () => {
    await scheduler.stop();
  });

describe('syncPrices()', () => {
    it('does nothing when there are no tracked coins', async () => {
      await scheduler.syncPrices();

      expect(cmc.calls).toEqual([]);
      const history = await prices.findByCoinId(1, 10);
      expect(history).toEqual([]);
    });

    it('fetches a price for every tracked coin and stores it', async () => {
      await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      await coins.create({ cmcId: 1027, symbol: 'ETH', name: 'Ethereum' });

      await scheduler.syncPrices();

      // CMC was queried once per coin
      expect(cmc.calls.sort()).toEqual([1, 1027]);

      const btc = await coins.findBySymbol('BTC');
      const eth = await coins.findBySymbol('ETH');

      const btcHistory = await prices.findByCoinId(btc!.id, 10);
      const ethHistory = await prices.findByCoinId(eth!.id, 10);

      expect(btcHistory).toHaveLength(1);
      expect(btcHistory[0].price).toBe(50000);

      expect(ethHistory).toHaveLength(1);
      expect(ethHistory[0].price).toBe(3000);
    });

    it('updates coins.last_updated_at with the CMC timestamp', async () => {
      const c = await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      expect(c.last_updated_at).toBeNull();

      await scheduler.syncPrices();

      const refreshed = await coins.findById(c.id);
      expect(refreshed?.last_updated_at).toBe('2026-10-05T18:00:00.000Z');
    });

    it('continues syncing other coins when one fails', async () => {
      await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      await coins.create({ cmcId: 1027, symbol: 'ETH', name: 'Ethereum' });

      // Make BTC fail
      cmc.shouldFailFor.add(1);

      await scheduler.syncPrices();

      // Both coins were attempted
      expect(cmc.calls.sort()).toEqual([1, 1027]);

      // ETH's price was stored; BTC's was not
      const btc = await coins.findBySymbol('BTC');
      const eth = await coins.findBySymbol('ETH');

      expect(await prices.findByCoinId(btc!.id, 10)).toEqual([]);
      expect(await prices.findByCoinId(eth!.id, 10)).toHaveLength(1);
    });

    it('records a task_runs row per successful cycle', async () => {
      await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });

      await scheduler.syncPrices();

      const runs = await new Promise<any[]>((resolve, reject) => {
        getDb().all(
          'SELECT * FROM task_runs ORDER BY id DESC',
          (err, rows) => (err ? reject(err) : resolve(rows as any[]))
        );
      });

      expect(runs).toHaveLength(1);
      expect(runs[0].task_name).toBe('sync_prices');
      expect(runs[0].status).toBe('success');
      expect(runs[0].started_at).toBeDefined();
      expect(runs[0].finished_at).toBeDefined();
    });

    it('marks task_runs as error when the outer cycle throws', async () => {
      // Force findAll() to throw by closing the DB temporarily
      const originalFindAll = coins.findAll.bind(coins);
      // @ts-ignore
      coins.findAll = async () => { throw new Error('simulated DB failure'); };

      await scheduler.syncPrices();

      const runs = await new Promise<any[]>((resolve, reject) => {
        getDb().all(
          'SELECT * FROM task_runs ORDER BY id DESC',
          (err, rows) => (err ? reject(err) : resolve(rows as any[]))
        );
      });

      expect(runs[0].status).toBe('error');
      expect(runs[0].error).toMatch(/simulated DB failure/);

      // Restore
      // @ts-ignore
      coins.findAll = originalFindAll;
    });

    it('skips a run while another is in flight (no overlap)', async () => {
      await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
      cmc.delayMs = 100;

      // Fire two cycles concurrently
      const first = scheduler.syncPrices();
      const second = scheduler.syncPrices();

      await Promise.all([first, second]);

      // Only one cycle actually queried CMC
      expect(cmc.calls).toEqual([1]);
    });
  });

  describe('start() and stop()', () => {
    it('start() is idempotent — calling twice does not create two intervals', async () => {
      const spy = jest.spyOn(global, 'setInterval');

      scheduler.start();
      scheduler.start();
      scheduler.start();

      // setInterval should have been called exactly once
      expect(spy).toHaveBeenCalledTimes(1);

      await scheduler.stop();
      spy.mockRestore();
    });

    it('stop() is idempotent — safe to call multiple times', async () => {
      scheduler.start();
      await scheduler.stop();
      await scheduler.stop();
      await scheduler.stop();
    });

    it('stop() prevents further scheduled syncs', async () => {
      const cfg = (require('../../src/config') as any).config;
      const originalInterval = cfg.syncIntervalMs;
      cfg.syncIntervalMs = 30;

       try {
         await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });

         // Rebuild the scheduler so it picks up the new interval
         scheduler = new TaskScheduler(coins, prices, cmc as any);

         scheduler.start();
         await new Promise((r) => setTimeout(r, 80));   

         await scheduler.stop();                       
         const callsAfterStop = cmc.calls.length;

         await new Promise((r) => setTimeout(r, 100));
         expect(cmc.calls.length).toBe(callsAfterStop);
      } finally {
         cfg.syncIntervalMs = originalInterval;
        }
     });
  });
});