import { CoinRepository } from '../repositories/CoinRepository';
import { PriceRepository } from '../repositories/PriceRepository';
import { CoinMarketCapService } from './CoinMarketCapService';
import { getDb } from '../db/connection';
import { config } from '../config';
import { logger } from '../utils/logger';

export class TaskScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private timers: NodeJS.Timeout[] = [];
  private isRunning = false;
  private runningPromise: Promise<void> | null = null; 
  constructor(
    private coins = new CoinRepository(),
    private prices = new PriceRepository(),
    private cmc = new CoinMarketCapService()
  ) {}

  // Start the periodic sync loop
  start(): void {
    if (this.intervalId) return;
    logger.info('Scheduler started', { intervalMs: config.syncIntervalMs });
    this.intervalId = setInterval(() => {
      this.runningPromise = this.syncPrices();
    }, config.syncIntervalMs);
    // Allow process to exit even if the interval is still set
    this.intervalId.unref?.();
  }

  // Stop the loop and clear every timer
 async stop(): Promise<void> {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.timers.forEach((t) => clearTimeout(t));
      this.timers = [];
    // Wait for any in-flight sync to complete
    if (this.runningPromise) {
      try { await this.runningPromise; } catch { /* exist in syncPrices */ }
      this.runningPromise = null;
    }
      logger.info('Scheduler stopped');
      
   
  }

  async syncPrices(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Sync already running, skipping');
      return;
    }
    this.isRunning = true;
    const startedAt = new Date().toISOString();
    const runId = await this.recordTaskRun('sync_prices', startedAt, 'running');

    try {
      const coins = await this.coins.findAll();
      let success = 0;
      let failed = 0;
     //Run one sync cycle. Fetches the latest price for every tracked coin,
      for (const coin of coins) {
        try {
          const quote = await this.cmc.getQuoteById(coin.cmc_id);
          await this.prices.insert(coin.id, quote.price, quote.currency);
          await this.coins.touchLastUpdated(coin.id, quote.lastUpdated);
          success++;
          logger.debug('Synced coin', { symbol: coin.symbol, price: quote.price });
        } catch (err: any) {
          failed++;
          logger.error('Failed to sync coin', {
            symbol: coin.symbol,
            cmcId: coin.cmc_id,
            error: err.message,
          });
          
        }
      }

      await this.finishTaskRun(runId, 'success');
      logger.info('Sync completed', { total: coins.length, success, failed });
    } catch (err: any) {
      await this.finishTaskRun(runId, 'error', err.message);
      logger.error('Sync failed', { error: err.message });
    } finally {
      this.isRunning = false;
    }
  }

  //  helpers for the task_runs table
  private recordTaskRun(name: string, startedAt: string, status: string): Promise<number> {
    return new Promise((resolve, reject) => {
      getDb().run(
        'INSERT INTO task_runs (task_name, status, started_at) VALUES (?, ?, ?)',
        [name, status, startedAt],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  private finishTaskRun(id: number, status: string, error?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      getDb().run(
        `UPDATE task_runs
            SET status = ?, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), error = ?
          WHERE id = ?`,
        [status, error ?? null, id],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }
}