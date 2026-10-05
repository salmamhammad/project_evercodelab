import { CoinRepository, Coin } from '../repositories/CoinRepository';
import { PriceRepository, PriceRecord } from '../repositories/PriceRepository';
import { BinanceService } from './BinanceService';
import { ConflictError, NotFoundError } from '../errors/AppError';
import { logger } from '../utils/logger';

export class CoinService {
  constructor(
    private coins = new CoinRepository(),
    private prices = new PriceRepository(),
    private binance = new BinanceService()
  ) {}

  list(): Promise<Coin[]> {
    return this.coins.findAll();
  }

  async getById(id: number): Promise<Coin> {
    const coin = await this.coins.findById(id);
    if (!coin) throw new NotFoundError(`Coin ${id} not found`);
    return coin;
  }

  async add(symbol: string, name: string): Promise<Coin> {
    const normalized = symbol.trim().toUpperCase();
    const existing = await this.coins.findBySymbol(symbol);
    if (existing) throw new ConflictError(`Coin ${symbol} already tracked`);

    try {
      await this.binance.getCurrentPrice(normalized);
    } catch (err) {
      throw err;
    }

    const coin = await this.coins.create(normalized, name);
    logger.info('Coin added', { id: coin.id, symbol: coin.symbol });
    return coin;
  }

  async update(id: number, symbol: string, name: string): Promise<Coin> {
    const coin = await this.coins.update(id, symbol, name);
    if (!coin) throw new NotFoundError(`Coin ${id} not found`);
    return coin;
  }

  async remove(id: number): Promise<void> {
    const ok = await this.coins.delete(id);
    if (!ok) throw new NotFoundError(`Coin ${id} not found`);
  }

  async getCurrentPrice(id: number): Promise<{ coin: Coin; price: number }> {
    const coin = await this.getById(id);
    const price = await this.binance.getCurrentPrice(coin.symbol);
    return { coin, price };
  }

  async getHistory(id: number, limit: number, from?: string, to?: string): Promise<PriceRecord[]> {
    await this.getById(id);
    return this.prices.findByCoinId(id, limit, from, to);
  }
}