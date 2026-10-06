import dotenv from 'dotenv';
dotenv.config({ quiet: true });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiKey: process.env.API_KEY || 'default-secret-key',
  dbPath: process.env.DB_PATH || './data/crypto.db',
  syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10),
  cmc: {
    apiKey: requireEnv('CMC_API_KEY'),
    baseUrl: process.env.CMC_BASE_URL || 'https://pro-api.coinmarketcap.com',
    timeout: parseInt(process.env.CMC_TIMEOUT || '10000', 10),
    quoteCurrency: process.env.CMC_QUOTE_CURRENCY || 'USD',
  },
  nodeEnv: process.env.NODE_ENV || 'development',
};