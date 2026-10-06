import { getDb } from '../db/connection';

export interface PriceRecord {
  id: number;
  coin_id: number;
  price: number;
  recorded_at: string;
}

export class PriceRepository {
  insert(coinId: number, price: number, currency: string): Promise<void> {
    return new Promise((resolve, reject) => {
      getDb().run(
        'INSERT INTO price_history (coin_id, price, currency) VALUES (?,?,?)',
        [coinId, price, currency],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  findByCoinId(coinId: number, limit = 100, from?: string, to?: string): Promise<PriceRecord[]> {
    return new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM price_history WHERE coin_id = ?';
      const params: (number | string)[] = [coinId];

      if (from) { sql += ' AND recorded_at >= ?'; params.push(from); }
      if (to)   { sql += ' AND recorded_at <= ?'; params.push(to); }

      sql += ' ORDER BY recorded_at DESC, id DESC LIMIT ?';
      params.push(limit);

      getDb().all<PriceRecord>(sql, params, (err, rows) =>
        err ? reject(err) : resolve(rows)
      );
    });
  }

  getLatest(coinId: number): Promise<PriceRecord | undefined> {
    return new Promise((resolve, reject) => {
      getDb().get<PriceRecord>(
        `SELECT * FROM price_history WHERE coin_id = ?
         ORDER BY recorded_at DESC, id DESC LIMIT 1`,
        [coinId],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
  }
}