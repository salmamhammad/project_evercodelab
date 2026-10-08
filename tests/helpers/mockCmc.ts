import { ExternalApiError, NotFoundError } from '../../src/errors/AppError';

export class MockCoinMarketCapService {
  public calls: string[] = [];
  public shouldFail = false;
  public failureError: Error = new ExternalApiError('mock failure');

  public quotes: Record<string, any> = {
    BTC:  { cmcId: 1,    symbol: 'BTC', name: 'Bitcoin',  price: 50000, currency: 'USD', lastUpdated: '2026-10-05T18:00:00.000Z' },
    ETH:  { cmcId: 1027, symbol: 'ETH', name: 'Ethereum', price: 3000,  currency: 'USD', lastUpdated: '2026-10-05T18:00:00.000Z' },
    SOL:  { cmcId: 5426, symbol: 'SOL', name: 'Solana',   price: 100,   currency: 'USD', lastUpdated: '2026-10-05T18:00:00.000Z' },
  };

  public quotesById: Record<number, any> = {};

  constructor() {
    for (const q of Object.values(this.quotes)) {
      this.quotesById[q.cmcId] = q;
    }
  }

  async getQuoteBySymbol(symbol: string) {
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