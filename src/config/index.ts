import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiKey: process.env.API_KEY || 'default-secret-key',
  binanceBaseUrl: process.env.BINANCE_BASE_URL || 'https://api.binance.com',
  binanceTimeout: parseInt(process.env.BINANCE_TIMEOUT || '10000', 10),
  dbPath: process.env.DB_PATH || './data/crypto.db',
  syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '60000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};