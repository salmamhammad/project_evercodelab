 // check the coin when create 
export function validateCoinCreate(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Body must be an object';

  const { symbol, name } = body;
  if (typeof symbol !== 'string' || symbol.trim().length === 0) {
    return 'symbol is required and must be a non-empty string';
  }
  if (!/^[A-Za-z]{2,10}$/.test(symbol.trim())) {
    return 'symbol must be 2–10 letters (A–Z), no digits or symbols';
  }

  if (name !== undefined) {
    if (typeof name !== 'string') return 'name must be a string';
    if (name.trim().length === 0) return 'name must not be empty';
    if (name.length > 100) return 'name must be at most 100 characters';
  }

  return null;
}
 // check the coin when update
export function validateCoinUpdate(body: any): string | null {
  if (!body || typeof body !== 'object') return 'Body must be an object';

  const { name } = body;
  if (typeof name !== 'string') return 'name is required and must be a string';
  if (name.trim().length === 0) return 'name must not be empty';
  if (name.length > 100) return 'name must be at most 100 characters';

  return null;
}

export function validateIdParam(param: string | string[] | undefined): string | null {
  const n = Number(param);
  if (!Number.isInteger(n) || n < 1) {
    return 'id must be a positive integer';
  }
  return null;
}
// check if parameter limit , from , to  is well-typed
export function validateHistoryQuery(q: any): string | null {
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      return 'limit must be an integer between 1 and 1000';
    }
  }
  if (q.from && isNaN(Date.parse(q.from))) return 'from must be a valid ISO date';
  if (q.to && isNaN(Date.parse(q.to))) return 'to must be a valid ISO date';
  if (q.from && q.to && Date.parse(q.from) > Date.parse(q.to)) {
    return 'from must not be later than to';
  }
  return null;
}