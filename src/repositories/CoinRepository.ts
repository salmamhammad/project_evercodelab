import { getDb } from '../db/connection';

export interface Coin {
  id: number;
  cmc_id: number;
  symbol: string;
  name: string;
  last_updated_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface CreateCoinInput {
  cmcId: number;
  symbol: string;
  name: string;
  lastUpdatedAt?: string;
}
export class CoinRepository {
  findAll(): Promise<Coin[]> {
    return new Promise((resolve, reject) => {
      getDb().all<Coin>(
        'SELECT * FROM coins ORDER BY id ASC',
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  }

  findById(id: number): Promise<Coin | undefined> {
    return new Promise((resolve, reject) => {
      getDb().get<Coin>(
        'SELECT * FROM coins WHERE id = ?',
        [id],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
  }

  findBySymbol(symbol: string): Promise<Coin | undefined> {
    return new Promise((resolve, reject) => {
      getDb().get<Coin>(
        'SELECT * FROM coins WHERE UPPER(symbol) = UPPER(?)',
        [symbol],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
  }

  create(input: CreateCoinInput): Promise<Coin> {
    return new Promise((resolve, reject) => {
      getDb().run(
        'INSERT INTO coins (cmc_id, symbol, name, last_updated_at) VALUES (?,?,?,?)',
        [input.cmcId, input.symbol.toUpperCase(), input.name, input.lastUpdatedAt ?? null],
        function (err) {
          if (err) return reject(err);
          getDb().get<Coin>(
            'SELECT * FROM coins WHERE id = ?',
            [this.lastID],
            (e, row) => (e ? reject(e) : resolve(row!))
          );
        }
      );
    });
  }

  updateName(id: number, name: string): Promise<Coin | undefined> {
    return new Promise((resolve, reject) => {
      getDb().run(
        `UPDATE coins SET name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`,
        [name, id],
        function (err) {
          if (err) return reject(err);
          if (this.changes === 0) return resolve(undefined);
          getDb().get<Coin>(
            'SELECT * FROM coins WHERE id = ?',
            [id],
            (e, row) => (e ? reject(e) : resolve(row))
          );
        }
      );
    });
  }

  delete(id: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      getDb().run('DELETE FROM coins WHERE id = ?', [id], function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      });
    });
  }
  
  touchLastUpdated(id: number, isoTime: string): Promise<void> {
    return new Promise((resolve, reject) => {
      getDb().run(
        `UPDATE coins SET last_updated_at = ? WHERE id = ?`,
        [isoTime, id],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }
}