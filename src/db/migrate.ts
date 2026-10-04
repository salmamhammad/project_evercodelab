import fs from 'fs';
import path from 'path';
import { getDb } from './connection';

export function runMigrations(): Promise<void> {
  return new Promise((resolve, reject) => {
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'),
      'utf-8'
    );
    getDb().exec(schema, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}