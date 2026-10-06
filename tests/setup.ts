// Global test setup
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.DB_PATH = ':memory:';
process.env.CMC_API_KEY = 'test-cmc-key';        
process.env.CMC_QUOTE_CURRENCY = 'USD';
process.env.CMC_BASE_URL = 'https://pro-api.coinmarketcap.com';
process.env.CMC_TIMEOUT = '5000';
jest.setTimeout(10000);