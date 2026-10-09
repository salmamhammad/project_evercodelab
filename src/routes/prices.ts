import { Router } from 'express';
import { CoinService } from '../services/CoinService';
import { validateQuery } from '../middleware/validate';
import { validateHistoryQuery, validateIdParam } from '../validators/coinValidator';
import { ValidationError } from '../errors/AppError';

export function priceRoutes(service: CoinService): Router {
  const router = Router();

 /**
   * @openapi
   * /api/coins/{id}/current:
   *   get:
   *     summary: Get the current price from CoinMarketCap
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Current price }
   *       400: { description: Invalid id }
   *       404: { description: Coin not tracked }
   *       502: { description: CoinMarketCap unavailable }
   */
  router.get('/:id/current', async (req, res, next) => {
    try {
      const err = validateIdParam(req.params.id);
      if (err) throw new ValidationError(err, { id: req.params.id });
      const result = await service.getCurrentPrice(Number(req.params.id));
      res.json(result);
    } catch (e) { next(e); }
  });

  /**
   * @openapi
   * /api/coins/{id}/history:
   *   get:
   *     summary: Get stored price history
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, minimum: 1, maximum: 1000, default: 100 }
   *       - in: query
   *         name: from
   *         schema: { type: string, format: date-time }
   *       - in: query
   *         name: to
   *         schema: { type: string, format: date-time }
   *     responses:
   *       200: { description: Price history }
   *       400: { description: Invalid query }
   *       404: { description: Coin not tracked }
   */
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