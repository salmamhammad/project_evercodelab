import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../errors/AppError';

export function validateBody(schema: (body: any) => string | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const error = schema(req.body);
    if (error) return next(new ValidationError(error, { body: req.body }));
    next();
  };
}

export function validateQuery(schema: (q: any) => string | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const error = schema(req.query);
    if (error) return next(new ValidationError(error, { query: req.query }));
    next();
  };
}