import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { UnauthorizedError } from '../errors/AppError';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing Bearer token'));
  }
  const token = header.slice('Bearer '.length).trim();
  if (token !== config.apiKey) {
    return next(new UnauthorizedError('Invalid API key'));
  }
  next();
}