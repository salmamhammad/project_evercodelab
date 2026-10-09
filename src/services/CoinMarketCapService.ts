import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { ExternalApiError, NotFoundError } from '../errors/AppError';
import { logger } from '../utils/logger';

export interface CmcQuote {
  cmcId: number;
  symbol: string;
  name: string;
  price: number;
  currency: string;
  lastUpdated: string;
}

export class CoinMarketCapService  {
  private client: AxiosInstance;

  constructor(client?: AxiosInstance) {
    this.client = client ?? axios.create({
      baseURL: config.cmc.baseUrl,
      timeout: config.cmc.timeout,
      headers: {
        'X-CMC_PRO_API_KEY': config.cmc.apiKey,
        'Accept': 'application/json',
      },
    });
  }

  async getQuoteBySymbol(symbol: string): Promise<CmcQuote> {
    const upper = symbol.toUpperCase();
    return this.fetchQuote('/v1/cryptocurrency/quotes/latest', {
      symbol: upper,
      convert: config.cmc.quoteCurrency,
    }, upper);
  }
    async getQuoteById(cmcId: number): Promise<CmcQuote> {
    return this.fetchQuote('/v2/cryptocurrency/quotes/latest', {
      id: cmcId,
      convert: config.cmc.quoteCurrency,
    }, String(cmcId));
  }
  private async fetchQuote(
    path: string,
    params: Record<string, string | number>,
    lookupKey: string
  ): Promise<CmcQuote> {
    try {
      logger.debug('CMC request', { path, params });
      const { data } = await this.client.get(path, { params });

      // CMC wraps errors inside HTTP 200 responses
      if (data?.status?.error_code && data.status.error_code !== 0) {
        const msg = data.status.error_message || 'CMC returned an error';
        if ([1001, 1002].includes(data.status.error_code)) {
          throw new NotFoundError(`Symbol/id ${lookupKey} not found on CoinMarketCap`);
        }
        throw new ExternalApiError(`CoinMarketCap error: ${msg}`, {
          cmcErrorCode: data.status.error_code,
        });
      }

      const entry = data?.data?.[lookupKey];
      if (!entry) throw new NotFoundError(`Symbol/id ${lookupKey} not found on CoinMarketCap`);

      const quote = entry.quote?.[config.cmc.quoteCurrency];
      if (!quote || typeof quote.price !== 'number') {
        throw new ExternalApiError(
          `CMC did not return a ${config.cmc.quoteCurrency} quote for ${lookupKey}`
        );
      }

      return {
        cmcId: entry.id,
        symbol: entry.symbol,
        name: entry.name,
        price: quote.price,
        currency: config.cmc.quoteCurrency,
        lastUpdated: quote.last_updated,
      };
    } catch (err: any) {
      if (err instanceof NotFoundError || err instanceof ExternalApiError) throw err;

      if (err.code === 'ECONNABORTED') {
        throw new ExternalApiError('CoinMarketCap request timed out');
      }
      if (err.response?.status === 401) {
        throw new ExternalApiError('CoinMarketCap rejected the API key', {
          status: 401,
        });
      }
      if (err.response?.status === 429) {
        throw new ExternalApiError('CoinMarketCap rate limit exceeded', {
          status: 429,
        });
      }
      throw new ExternalApiError('CoinMarketCap request failed', {
        originalError: err.message,
      });
    }
  }
}