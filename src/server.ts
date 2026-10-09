import { createApp } from './app';
import { config } from './config';
import { initDb, closeDb } from './db/connection';
import { runMigrations } from './db/migrate';
import { TaskScheduler } from './services/TaskScheduler';
import { logger } from './utils/logger';

async function bootstrap() {
  await initDb();
  await runMigrations();
  const scheduler = new TaskScheduler();
  scheduler.start();
  void scheduler.syncPrices();

  const app = createApp();
  const server = app.listen(config.port, () =>
    logger.info(`Server running on port ${config.port}`)
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down...`);

    server.close(async () => {
      try {
        await scheduler.stop();
        await closeDb();
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (err: any) {
        logger.error('Shutdown error', { error: err.message });
        process.exit(1);
      }
    });

    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
  };

  process.on('SIGINT',  () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Bootstrap failed', { error: err.message });
  process.exit(1);
});