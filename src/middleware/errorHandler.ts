import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn('App error', { name: err.name, message: err.message });
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
      timestamp: err.timestamp,
      context: err.context,
    });
    return;
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: 'NotFound',
    message: 'Route not found',
  });
}