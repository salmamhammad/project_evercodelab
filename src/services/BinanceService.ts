import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { ExternalApiError, NotFoundError } from '../errors/AppError';
import { logger } from '../utils/logger';

export interface TickerPrice {
  symbol: string;
  price: string;
}

export class BinanceService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.binanceBaseUrl,
      timeout: config.binanceTimeout,
    });
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    const upper = symbol.toUpperCase();
    try {
      logger.debug('Fetching Binance price', { symbol: upper });
      const { data } = await this.client.get<TickerPrice>('/api/v3/ticker/price', {
        params: { symbol: upper },
      });
      return parseFloat(data.price);
    } catch (err: any) {
      if (err.response?.status === 400) {
        throw new NotFoundError(`Symbol ${upper} not found on Binance`);
      }
      if (err.code === 'ECONNABORTED') {
        throw new ExternalApiError('Binance API request timed out');
      }
      throw new ExternalApiError('Binance API request failed', {
        originalError: err.message,
      });
    }
  }
}