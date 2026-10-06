import { CoinMarketCapService } from '../../src/services/CoinMarketCapService';
import { ExternalApiError, NotFoundError } from '../../src/errors/AppError';

describe('CoinMarketCapService', () => {
  function makeAxiosMock(getImpl: jest.Mock) {
    return { get: getImpl } as any;
  }

  describe('getQuoteBySymbol', () => {
    it('returns a parsed quote on success', async () => {
      const get = jest.fn().mockResolvedValue({
        data: {
          status: { error_code: 0, error_message: null },
          data: {
            BTC: {
              id: 1,
              symbol: 'BTC',
              name: 'Bitcoin',
              quote: {
                USD: {
                  price: 50000,
                  last_updated: '2026-10-05T18:00:00.000Z',
                },
              },
            },
          },
        },
      });
      const svc = new CoinMarketCapService(makeAxiosMock(get));

      const q = await svc.getQuoteBySymbol('btc');
      expect(q).toEqual({
        cmcId: 1,
        symbol: 'BTC',
        name: 'Bitcoin',
        price: 50000,
        currency: 'USD',
        lastUpdated: '2026-10-05T18:00:00.000Z',
      });
      // Verify the symbol was uppercased in the request
      expect(get).toHaveBeenCalledWith(
        '/v1/cryptocurrency/quotes/latest',
        expect.objectContaining({
          params: expect.objectContaining({ symbol: 'BTC', convert: 'USD' }),
        })
      );
    });

    it('throws NotFoundError when CMC error_code is 1001', async () => {
      const get = jest.fn().mockResolvedValue({
        data: {
          status: { error_code: 1001, error_message: 'Invalid symbol' },
          data: {},
        },
      });
      const svc = new CoinMarketCapService(makeAxiosMock(get));
      await expect(svc.getQuoteBySymbol('FAKE')).rejects.toThrow(NotFoundError);
    });

    it('throws ExternalApiError on HTTP 429 (rate limit)', async () => {
      const get = jest.fn().mockRejectedValue({ response: { status: 429 } });
      const svc = new CoinMarketCapService(makeAxiosMock(get));
      await expect(svc.getQuoteBySymbol('BTC')).rejects.toThrow(ExternalApiError);
    });

    it('throws ExternalApiError on HTTP 401 (bad API key)', async () => {
      const get = jest.fn().mockRejectedValue({ response: { status: 401 } });
      const svc = new CoinMarketCapService(makeAxiosMock(get));
      await expect(svc.getQuoteBySymbol('BTC')).rejects.toThrow(ExternalApiError);
    });

    it('throws ExternalApiError on timeout', async () => {
      const get = jest.fn().mockRejectedValue({ code: 'ECONNABORTED' });
      const svc = new CoinMarketCapService(makeAxiosMock(get));
      await expect(svc.getQuoteBySymbol('BTC')).rejects.toThrow(ExternalApiError);
    });

    it('throws ExternalApiError when CMC returns a non-1001 error_code', async () => {
      const get = jest.fn().mockResolvedValue({
        data: {
          status: { error_code: 5000, error_message: 'Server error' },
          data: {},
        },
      });
      const svc = new CoinMarketCapService(makeAxiosMock(get));
      await expect(svc.getQuoteBySymbol('BTC')).rejects.toThrow(ExternalApiError);
    });
  });

  describe('getQuoteById', () => {
    it('returns a parsed quote by id', async () => {
      const get = jest.fn().mockResolvedValue({
        data: {
          status: { error_code: 0 },
          data: {
            '1': {
              id: 1,
              symbol: 'BTC',
              name: 'Bitcoin',
              quote: {
                USD: { price: 50000, last_updated: '2026-10-05T18:00:00.000Z' },
              },
            },
          },
        },
      });
      const svc = new CoinMarketCapService(makeAxiosMock(get));

      const q = await svc.getQuoteById(1);
      expect(q.cmcId).toBe(1);
      expect(q.price).toBe(50000);
      expect(get).toHaveBeenCalledWith(
        '/v2/cryptocurrency/quotes/latest',
        expect.objectContaining({
          params: expect.objectContaining({ id: 1, convert: 'USD' }),
        })
      );
    });

    it('throws NotFoundError when CMC error_code is 1002', async () => {
      const get = jest.fn().mockResolvedValue({
        data: { status: { error_code: 1002, error_message: 'Invalid id' }, data: {} },
      });
      const svc = new CoinMarketCapService(makeAxiosMock(get));
      await expect(svc.getQuoteById(99999)).rejects.toThrow(NotFoundError);
    });
  });
});