import { initDb, closeDb, getDb } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { CoinRepository } from '../../src/repositories/CoinRepository';
import { PriceRepository } from '../../src/repositories/PriceRepository';
import { CoinService } from '../../src/services/CoinService';
import { NotFoundError, ConflictError, ExternalApiError } from '../../src/errors/AppError';

//  Mock MockCoinMarketCapService 
class MockCoinMarketCapService {
  public calls: string[] = [];
  public shouldFail = false;
  public failureError: Error = new ExternalApiError('mock failure');
  public quotes: Record<string, any> = {
    BTC: { cmcId: 1, symbol: 'BTC', name: 'Bitcoin', price: 50000, currency: 'USD', lastUpdated: '2026-10-05T18:00:00.000Z' },
    ETH: { cmcId: 1027, symbol: 'ETH', name: 'Ethereum', price: 3000, currency: 'USD', lastUpdated: '2026-10-05T18:00:00.000Z' },
    SOL: { cmcId: 5426, symbol: 'SOL', name: 'Solana', price: 100, currency: 'USD', lastUpdated: '2026-10-05T18:00:00.000Z' },
  };
  public quotesById: Record<number, any> = {}
  constructor() {
    for (const q of Object.values(this.quotes)) this.quotesById[q.cmcId] = q;
  }
  async getQuoteBySymbol(symbol: string){
    this.calls.push(`symbol:${symbol.toUpperCase()}`);
    if (this.shouldFail) throw this.failureError;
    const q = this.quotes[symbol.toUpperCase()];
    if (!q) throw new NotFoundError(`Symbol ${symbol} not found on CoinMarketCap`);
    return q;
  }
  async getQuoteById(id: number) {
    this.calls.push(`id:${id}`);
    if (this.shouldFail) throw this.failureError;
    const q = this.quotesById[id];
    if (!q) throw new NotFoundError(`Id ${id} not found on CoinMarketCap`);
    return q;
  }
}

//  tests
describe('CoinService (integration, real DB + mocked MockCoinMarketCap)', () => {
  let coins: CoinRepository;
  let prices: PriceRepository;
  let cmc: MockCoinMarketCapService;
  let service: CoinService;

  beforeAll(async () => {
    await initDb();
    await runMigrations();
  });

  afterAll(async () => {
    await closeDb();
  });

  beforeEach(async () => {
    // Clean DB between tests
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
  });
  describe('list()', () => {
  it('returns an empty array when no coins exist', async () => {
    expect(await service.list()).toEqual([]);
  });

  it('returns all tracked coins', async () => {
    await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
    await coins.create({ cmcId: 1027, symbol: 'ETH', name: 'Ethereum' });

    const result = await service.list();
    expect(result.map((c) => c.symbol)).toEqual(['BTC', 'ETH']);
  });
});

describe('getById()', () => {
  it('returns the coin when it exists', async () => {
    const created = await coins.create({ cmcId: 1, symbol: 'BTC', name: 'Bitcoin' });
    const found = await service.getById(created.id);
    expect(found.symbol).toBe('BTC');
  });

  it('throws NotFoundError when the coin does not exist', async () => {
    await expect(service.getById(99999)).rejects.toThrow(NotFoundError);
  });
});

describe('add()', () => {
  it('creates a coin when the symbol is valid on MockCoinMarketCap', async () => {
    const coin = await service.add('BTC', 'Bitcoin');

    expect(coin.symbol).toBe('BTC');
    expect(coin.name).toBe('Bitcoin');
    expect(coin.cmc_id).toBe(1);
    expect(coin.id).toBeGreaterThan(0);
    expect(coin.last_updated_at).toBe('2026-10-05T18:00:00.000Z');

    // Verify it was persisted
    expect(await coins.findById(coin.id)).toBeDefined();


    // cmc  was consulted exactly once
    expect(cmc.calls).toEqual(['symbol:BTC']);
  });


  it('throws ConflictError when the symbol is already tracked', async () => {
    await service.add('BTC', 'Bitcoin');
    cmc.calls = [];
    await expect(service.add('BTC', 'Bitcoin Again'))
      .rejects.toThrow(ConflictError);

     // The duplicate check must run before CMC is called
    expect(cmc.calls).toEqual([]);
  });

  it('propagates NotFoundError when cmc rejects the symbol', async () => {
    await expect(service.add('FAKE', 'Fake Coin'))
      .rejects.toThrow(NotFoundError);

    // Nothing should have been persisted
    expect(await coins.findBySymbol('FAKE')).toBeUndefined();
  });

  it('propagates ExternalApiError when cmc is unreachable', async () => {
    cmc.shouldFail = true;

    await expect(service.add('BTC', 'Bitcoin'))
      .rejects.toThrow(ExternalApiError);

    // validation happens before insert
    expect(await coins.findBySymbol('BTC')).toBeUndefined();
  });
});

describe('update()', () => {
  it('updates an existing coin', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
      });
    const u = await service.update(c.id, 'BTC', 'Bitcoin Core');
    expect(u.name).toBe('Bitcoin Core');
    // symbol and cmc_id are immutable
    expect(u.symbol).toBe('BTC');
    expect(u.cmc_id).toBe(1);
  });

  it('throws NotFoundError for a missing id', async () => {
    await expect(service.update(99999, 'BTC', 'Bitcoin'))
      .rejects.toThrow(NotFoundError);
  });
});

describe('remove()', () => {
  it('deletes an existing coin', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
      });
    await service.remove(c.id);
    expect(await coins.findById(c.id)).toBeUndefined();
  });

  it('throws NotFoundError for a missing id', async () => {
    await expect(service.remove(99999)).rejects.toThrow(NotFoundError);
  });

  it('cascades to price history', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
      });
    await prices.insert(c.id, 50000, 'USD');

    await service.remove(c.id);

    expect(await prices.findByCoinId(c.id, 10)).toEqual([]);
  });
});

describe('getCurrentPrice()', () => {
  it('returns the coin and its current price from MockCoinMarketCap', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
      });

    const result = await service.getCurrentPrice(c.id);

    expect(result.coin.id).toBe(c.id);
    expect(result.price).toBe(50000);
    expect(result.currency).toBe('USD');
    expect(cmc.calls).toEqual(['id:1']);

    // last_updated_at was refreshed
    const refreshed = await coins.findById(c.id);
    expect(refreshed?.last_updated_at).toBe('2026-10-05T18:00:00.000Z');

    // A new price_history row was inserted
    const history = await prices.findByCoinId(c.id, 10);
    expect(history).toHaveLength(1);
    expect(history[0].price).toBe(50000);
  });

  it('throws NotFoundError if the coin is not tracked', async () => {
    await expect(service.getCurrentPrice(99999))
      .rejects.toThrow(NotFoundError);

    // cmc should not have been called — the coin lookup failed first
    expect(cmc.calls).toEqual([]);
  });

  it('propagates ExternalApiError if cmc fails', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
    });
    cmc.shouldFail = true;

    await expect(service.getCurrentPrice(c.id))
      .rejects.toThrow(ExternalApiError);
  });
});

describe('getHistory()', () => {
  it('returns price history for a tracked coin', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
      });
    await prices.insert(c.id, 100, 'USD');
    await prices.insert(c.id, 200, 'USD');
    await prices.insert(c.id, 300, 'USD');

    const history = await service.getHistory(c.id, 10);

    // Ordered DESC by recorded_at
    expect(history.map((h) => h.price)).toEqual([300, 200, 100]);
  });

  it('respects the limit parameter', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
      });
    await prices.insert(c.id, 100, 'USD');
    await prices.insert(c.id, 200, 'USD');
    await prices.insert(c.id, 300, 'USD');

    const history = await service.getHistory(c.id, 2);
    expect(history).toHaveLength(2);
  });

  it('throws NotFoundError for a missing coin', async () => {
    await expect(service.getHistory(99999, 10))
      .rejects.toThrow(NotFoundError);
  });

  it('returns an empty array when the coin has no price history', async () => {
    const c = await coins.create({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
      });
    expect(await service.getHistory(c.id, 10)).toEqual([]);
  });
  
});
});
