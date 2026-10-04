import sqlite3 from 'sqlite3';
import { config } from '../config';
import { logger } from '../utils/logger';

let db: sqlite3.Database | null = null;

export function getDb(): sqlite3.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function initDb(): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(config.dbPath, (err) => {
      if (err) {
        logger.error('Failed to open DB', { err: err.message });
        return reject(err);
      }
      db!.run('PRAGMA foreign_keys = ON');
      logger.info('Database connected', { path: config.dbPath });
      resolve(db!);
    });
  });
}

export function closeDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return resolve();
    db.close((err) => {
      if (err) return reject(err);
      db = null;
      resolve();
    });
  });
}