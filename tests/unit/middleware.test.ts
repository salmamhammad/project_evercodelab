import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../src/middleware/auth';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';
import { ValidationError, NotFoundError, UnauthorizedError } from '../../src/errors/AppError';

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('authMiddleware', () => {
  const next = jest.fn() as unknown as NextFunction;

  beforeEach(() => (next as jest.Mock).mockClear());

  it('calls next() when a valid Bearer token is provided', () => {
    const req = {
      headers: { authorization: `Bearer ${process.env.API_KEY ?? 'test-api-key'}` },
    } as unknown as Request;
    authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('passes UnauthorizedError when header is missing', () => {
    const req = { headers: {} } as Request;
    authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('passes UnauthorizedError when scheme is not Bearer', () => {
    const req = { headers: { authorization: 'Basic abc' } } as unknown as Request;
    authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('passes UnauthorizedError when token is wrong', () => {
    const req = { headers: { authorization: 'Bearer wrong-token' } } as unknown as Request;
    authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});

describe('errorHandler', () => {
  it('serializes AppError with its status code', () => {
    const res = mockRes();
    const err = new NotFoundError('nope', { id: 42 });

    errorHandler(err, {} as Request, res, (() => {}) as NextFunction);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'NotFoundError',
        message: 'nope',
        context: { id: 42 },
      })
    );
  });

  it('serializes ValidationError as 400', () => {
    const res = mockRes();
    errorHandler(new ValidationError('bad'), {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('falls back to 500 for non-AppError', () => {
    const res = mockRes();
    errorHandler(new Error('boom'), {} as Request, res, (() => {}) as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'InternalServerError' })
    );
  });
});

describe('notFoundHandler', () => {
  it('responds with 404 and a JSON body', () => {
    const res = mockRes();
    notFoundHandler({} as Request, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'NotFound' })
    );
  });
});