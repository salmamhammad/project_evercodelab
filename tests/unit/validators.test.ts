import {
  validateCoinCreate,
  validateCoinUpdate,
  validateHistoryQuery,
  validateIdParam,
} from '../../src/validators/coinValidator';

describe('validateCoinCreate', () => {
  it('accepts a minimal valid payload', () => {
    expect(validateCoinCreate({ symbol: 'BTC' })).toBeNull();
  });

  it('accepts a valid payload with name', () => {
    expect(validateCoinCreate({ symbol: 'BTC', name: 'Bitcoin' })).toBeNull();
  });

  it('accepts lowercase symbols (service uppercases them)', () => {
    expect(validateCoinCreate({ symbol: 'btc' })).toBeNull();
  });

  it('rejects missing symbol', () => {
    expect(validateCoinCreate({})).toMatch(/symbol/);
  });

  it('rejects empty symbol', () => {
    expect(validateCoinCreate({ symbol: '' })).toMatch(/symbol/);
  });

  it('rejects symbols with digits', () => {
    expect(validateCoinCreate({ symbol: 'BTC1' })).toMatch(/2–10 letters/);
  });

  it('rejects symbols with separators', () => {
    expect(validateCoinCreate({ symbol: 'BTC-USD' })).toMatch(/2–10 letters/);
  });

  it('rejects symbols shorter than 2 or longer than 10 letters', () => {
    expect(validateCoinCreate({ symbol: 'B' })).toMatch(/2–10 letters/);
    expect(validateCoinCreate({ symbol: 'ABCDEFGHIJK' })).toMatch(/2–10 letters/);
  });

  it('rejects non-string name', () => {
    expect(validateCoinCreate({ symbol: 'BTC', name: 123 as any })).toMatch(/name/);
  });

  it('rejects empty name if provided', () => {
    expect(validateCoinCreate({ symbol: 'BTC', name: '   ' })).toMatch(/name/);
  });

  it('rejects overly long name', () => {
    expect(validateCoinCreate({ symbol: 'BTC', name: 'x'.repeat(101) })).toMatch(/100/);
  });

  it('rejects non-object body', () => {
    expect(validateCoinCreate(null)).toMatch(/object/);
    expect(validateCoinCreate('BTC')).toMatch(/object/);
  });
});

describe('validateCoinUpdate', () => {
  it('accepts a valid name', () => {
    expect(validateCoinUpdate({ name: 'Bitcoin Core' })).toBeNull();
  });

  it('rejects missing name', () => {
    expect(validateCoinUpdate({})).toMatch(/name/);
  });

  it('rejects empty name', () => {
    expect(validateCoinUpdate({ name: '   ' })).toMatch(/name/);
  });

  it('rejects non-string name', () => {
    expect(validateCoinUpdate({ name: 42 as any })).toMatch(/name/);
  });

  it('rejects overly long name', () => {
    expect(validateCoinUpdate({ name: 'x'.repeat(101) })).toMatch(/100/);
  });
});

describe('validateHistoryQuery', () => {
  it('accepts an empty query', () => {
    expect(validateHistoryQuery({})).toBeNull();
  });

  it('accepts a valid limit', () => {
    expect(validateHistoryQuery({ limit: '50' })).toBeNull();
  });

  it('rejects a non-numeric limit', () => {
    expect(validateHistoryQuery({ limit: 'abc' })).toMatch(/limit/);
  });

  it('rejects a limit out of bounds', () => {
    expect(validateHistoryQuery({ limit: '0' })).toMatch(/limit/);
    expect(validateHistoryQuery({ limit: '1001' })).toMatch(/limit/);
  });

  it('accepts valid from/to', () => {
    expect(
      validateHistoryQuery({
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-05T00:00:00.000Z',
      })
    ).toBeNull();
  });

  it('rejects invalid date strings', () => {
    expect(validateHistoryQuery({ from: 'not-a-date' })).toMatch(/from/);
    expect(validateHistoryQuery({ to: 'yesterday' })).toMatch(/to/);
  });

  it('rejects when from is later than to', () => {
    expect(
      validateHistoryQuery({
        from: '2026-10-05T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
      })
    ).toMatch(/from/);
  });
});

describe('validateIdParam', () => {
  it('accepts positive integers', () => {
    expect(validateIdParam('1')).toBeNull();
    expect(validateIdParam('42')).toBeNull();
  });

  it('rejects zero, negatives, floats, and non-numeric strings', () => {
    expect(validateIdParam('0')).toMatch(/positive/);
    expect(validateIdParam('-1')).toMatch(/positive/);
    expect(validateIdParam('1.5')).toMatch(/positive/);
    expect(validateIdParam('abc')).toMatch(/positive/);
  });
});