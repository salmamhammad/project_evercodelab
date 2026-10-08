import { CoinRepository, Coin } from '../repositories/CoinRepository';
import { PriceRepository, PriceRecord } from '../repositories/PriceRepository';
import { CoinMarketCapService } from './CoinMarketCapService';
import { ConflictError, NotFoundError } from '../errors/AppError';
import { logger } from '../utils/logger';
import { config } from '../config';

export class CoinService {
  constructor(
    private coins = new CoinRepository(),
    private prices = new PriceRepository(),
    private cmc = new CoinMarketCapService()
  ) {}

  list(): Promise<Coin[]> {
    return this.coins.findAll();
  }

  async getById(id: number): Promise<Coin> {
    const coin = await this.coins.findById(id);
    if (!coin) throw new NotFoundError(`Coin ${id} not found`);
    return coin;
  }
  // Adds a tracked coin
  async add(symbol: string, name: string): Promise<Coin> {
    const normalized = symbol.trim().toUpperCase();
    const existing = await this.coins.findBySymbol(normalized);
    if (existing) throw new ConflictError(`Coin ${normalized} already tracked`);

    
    const quote = await this.cmc.getQuoteBySymbol(normalized);
    
    const coin = await this.coins.create({
      cmcId: quote.cmcId,
      symbol: quote.symbol,
      name: name ?? quote.name,
      lastUpdatedAt: quote.lastUpdated,
    });

    await this.prices.insert(coin.id, quote.price, config.cmc.quoteCurrency);
    logger.info('Coin added', { id: coin.id, symbol: coin.symbol });
    return coin;
  }

  async update(id: number, name: string): Promise<Coin> {
    const coin = await this.coins.updateName(id, name);
    if (!coin) throw new NotFoundError(`Coin ${id} not found`);
    return coin;
  }

  async remove(id: number): Promise<void> {
    const ok = await this.coins.delete(id);
    if (!ok) throw new NotFoundError(`Coin ${id} not found`);
  }

  async getCurrentPrice(id: number): Promise<{ coin: Coin; price: number ; currency: string }> {
    const coin = await this.getById(id);
    const quote  = await this.cmc.getQuoteById(coin.cmc_id);
    // for updating last_updated_at and store the observation
    await this.coins.touchLastUpdated(coin.id, quote.lastUpdated);
    await this.prices.insert(coin.id, quote.price, quote.currency);

    return { coin, price: quote.price, currency: quote.currency };
  }

  async getHistory(id: number, limit: number, from?: string, to?: string): Promise<PriceRecord[]> {
    await this.getById(id);
    return this.prices.findByCoinId(id, limit, from, to);
  }
}