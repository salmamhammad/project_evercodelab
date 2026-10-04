import { ValidationError, NotFoundError, AppError } from '../../src/errors/AppError';

describe('Custom Errors', () => {
  it('ValidationError has 400 status', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err).toBeInstanceOf(AppError);
    expect(err.timestamp).toBeDefined();
  });

  it('NotFoundError has 404 status', () => {
    expect(new NotFoundError('not found').statusCode).toBe(404);
  });
});