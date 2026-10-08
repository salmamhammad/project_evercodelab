import { Router } from 'express';
import { CoinService } from '../services/CoinService';
import { validateQuery } from '../middleware/validate';
import { validateHistoryQuery, validateIdParam } from '../validators/coinValidator';
import { ValidationError } from '../errors/AppError';

export function priceRoutes(service: CoinService): Router {
  const router = Router();

 //Get the current price from CoinMarketCap
  router.get('/:id/current', async (req, res, next) => {
    try {
      const err = validateIdParam(req.params.id);
      if (err) throw new ValidationError(err, { id: req.params.id });
      const result = await service.getCurrentPrice(Number(req.params.id));
      res.json(result);
    } catch (e) { next(e); }
  });

  //Get stored price history
  router.get(
    '/:id/history',
    validateQuery(validateHistoryQuery),
    async (req, res, next) => {
      try {
        const err = validateIdParam(req.params.id);
        if (err) throw new ValidationError(err, { id: req.params.id });

        const limit = req.query.limit ? Number(req.query.limit) : 100;
        const from = req.query.from as string | undefined;
        const to = req.query.to as string | undefined;

        const history = await service.getHistory(Number(req.params.id), limit, from, to);
        res.json(history);
      } catch (e) { next(e); }
    }
  );

  return router;
}