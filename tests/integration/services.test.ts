import { initDb, closeDb, getDb } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { CoinRepository } from '../../src/repositories/CoinRepository';
import { PriceRepository } from '../../src/repositories/PriceRepository';
import { CoinService } from '../../src/services/CoinService';
import { NotFoundError, ConflictError, ExternalApiError } from '../../src/errors/AppError';

//  Mock BinanceService 
class MockBinanceService {
  public calls: string[] = [];
  public shouldFail = false;
  public failureError: Error = new ExternalApiError('mock failure');
  public priceMap: Record<string, number> = {
    BTCUSDT: 50000,
    ETHUSDT: 3000,
    SOLUSDT: 100,
  };

  async getCurrentPrice(symbol: string): Promise<number> {
    this.calls.push(symbol);
    if (this.shouldFail) throw this.failureError;
    const key = `${symbol.toUpperCase()}USDT`;
    if (!(key in this.priceMap)) {
      throw new NotFoundError(`Symbol ${symbol} not found`);
    }
    return this.priceMap[key];
  }
}

//  tests
describe('CoinService (integration, real DB + mocked Binance)', () => {
  let coins: CoinRepository;
  let prices: PriceRepository;
  let binance: MockBinanceService;
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
    binance = new MockBinanceService();

    service = new CoinService(coins, prices, binance as any);
  });
  describe('list()', () => {
  it('returns an empty array when no coins exist', async () => {
    expect(await service.list()).toEqual([]);
  });

  it('returns all tracked coins', async () => {
    await coins.create('BTC', 'Bitcoin');
    await coins.create('ETH', 'Ethereum');

    const result = await service.list();
    expect(result.map((c) => c.symbol)).toEqual(['BTC', 'ETH']);
  });
});

describe('getById()', () => {
  it('returns the coin when it exists', async () => {
    const created = await coins.create('BTC', 'Bitcoin');
    const found = await service.getById(created.id);
    expect(found.symbol).toBe('BTC');
  });

  it('throws NotFoundError when the coin does not exist', async () => {
    await expect(service.getById(99999)).rejects.toThrow(NotFoundError);
  });
});

describe('add()', () => {
  it('creates a coin when the symbol is valid on Binance', async () => {
    const coin = await service.add('BTC', 'Bitcoin');

    expect(coin.symbol).toBe('BTC');
    expect(coin.name).toBe('Bitcoin');
    expect(coin.id).toBeGreaterThan(0);

    // Verify it was persisted
    expect(await coins.findById(coin.id)).toBeDefined();

    // Verify Binance was consulted exactly once
    expect(binance.calls).toEqual(['BTC']);
  });

  it('uppercases the symbol before saving and validating', async () => {
    const coin = await service.add('btc', 'Bitcoin');
    expect(coin.symbol).toBe('BTC');
    expect(binance.calls).toEqual(['BTC']);
  });

  it('throws ConflictError when the symbol is already tracked', async () => {
    await service.add('BTC', 'Bitcoin');

    await expect(service.add('BTC', 'Bitcoin Again'))
      .rejects.toThrow(ConflictError);

    // Binance must NOT have been called the second time 
    expect(binance.calls).toEqual(['BTC']);
  });

  it('propagates NotFoundError when Binance rejects the symbol', async () => {
    await expect(service.add('FAKE', 'Fake Coin'))
      .rejects.toThrow(NotFoundError);

    // Nothing should have been persisted
    expect(await coins.findBySymbol('FAKE')).toBeUndefined();
  });

  it('propagates ExternalApiError when Binance is unreachable', async () => {
    binance.shouldFail = true;

    await expect(service.add('BTC', 'Bitcoin'))
      .rejects.toThrow(ExternalApiError);

    // validation happens before insert
    expect(await coins.findBySymbol('BTC')).toBeUndefined();
  });
});

describe('update()', () => {
  it('updates an existing coin', async () => {
    const c = await coins.create('BTC', 'Bitcoin');
    const u = await service.update(c.id, 'BTC', 'Bitcoin Core');
    expect(u.name).toBe('Bitcoin Core');
  });

  it('throws NotFoundError for a missing id', async () => {
    await expect(service.update(99999, 'BTC', 'Bitcoin'))
      .rejects.toThrow(NotFoundError);
  });
});

describe('remove()', () => {
  it('deletes an existing coin', async () => {
    const c = await coins.create('BTC', 'Bitcoin');
    await service.remove(c.id);
    expect(await coins.findById(c.id)).toBeUndefined();
  });

  it('throws NotFoundError for a missing id', async () => {
    await expect(service.remove(99999)).rejects.toThrow(NotFoundError);
  });

  it('cascades to price history', async () => {
    const c = await coins.create('BTC', 'Bitcoin');
    await prices.insert(c.id, 50000);

    await service.remove(c.id);

    expect(await prices.findByCoinId(c.id, 10)).toEqual([]);
  });
});

describe('getCurrentPrice()', () => {
  it('returns the coin and its current price from Binance', async () => {
    const c = await coins.create('BTC', 'Bitcoin');

    const result = await service.getCurrentPrice(c.id);

    expect(result.coin.id).toBe(c.id);
    expect(result.price).toBe(50000);
    expect(binance.calls).toEqual(['BTC']);
  });

  it('throws NotFoundError if the coin is not tracked', async () => {
    await expect(service.getCurrentPrice(99999))
      .rejects.toThrow(NotFoundError);

    // Binance should not have been called — the coin lookup failed first
    expect(binance.calls).toEqual([]);
  });

  it('propagates ExternalApiError if Binance fails', async () => {
    const c = await coins.create('BTC', 'Bitcoin');
    binance.shouldFail = true;

    await expect(service.getCurrentPrice(c.id))
      .rejects.toThrow(ExternalApiError);
  });
});

describe('getHistory()', () => {
  it('returns price history for a tracked coin', async () => {
    const c = await coins.create('BTC', 'Bitcoin');
    await prices.insert(c.id, 100);
    await prices.insert(c.id, 200);
    await prices.insert(c.id, 300);

    const history = await service.getHistory(c.id, 10);

    // Ordered DESC by recorded_at
    expect(history.map((h) => h.price)).toEqual([300, 200, 100]);
  });

  it('respects the limit parameter', async () => {
    const c = await coins.create('BTC', 'Bitcoin');
    await prices.insert(c.id, 100);
    await prices.insert(c.id, 200);
    await prices.insert(c.id, 300);

    const history = await service.getHistory(c.id, 2);
    expect(history).toHaveLength(2);
  });

  it('throws NotFoundError for a missing coin', async () => {
    await expect(service.getHistory(99999, 10))
      .rejects.toThrow(NotFoundError);
  });

  it('returns an empty array when the coin has no price history', async () => {
    const c = await coins.create('BTC', 'Bitcoin');
    expect(await service.getHistory(c.id, 10)).toEqual([]);
  });
});
});
