import { Router } from 'express';
import { CoinService } from '../services/CoinService';
import { validateBody } from '../middleware/validate';
import { validateCoinCreate, validateCoinUpdate, validateIdParam } from '../validators/coinValidator';
import { ValidationError } from '../errors/AppError';

export function coinRoutes(service: CoinService): Router {
  const router = Router();
  /**
   * @openapi
   * /api/coins:
   *   get:
   *     summary: List all tracked coins
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: List of tracked coins }
   *       401: { description: Unauthorized }
   */
  router.get('/', async (_req, res, next) => {
    try {
      res.json(await service.list());
    } catch (e) { next(e); }
  });

  /**
   * @openapi
   * /api/coins/{id}:
   *   get:
   *     summary: Get one tracked coin by id
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: integer, minimum: 1 }
   *     responses:
   *       200: { description: The coin }
   *       400: { description: Invalid id }
   *       404: { description: Coin not found }
   */
  router.get('/:id', async (req, res, next) => {
    try {
      const err = validateIdParam(req.params.id);
      if (err) throw new ValidationError(err, { id: req.params.id });
      res.json(await service.getById(Number(req.params.id)));
    } catch (e) { next(e); }
  });

  /**
   * @openapi
   * /api/coins:
   *   post:
   *     summary: Start tracking a new coin (validated against CoinMarketCap)
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [symbol]
   *             properties:
   *               symbol: { type: string, example: BTC }
   *               name:   { type: string, example: Bitcoin }
   *     responses:
   *       201: { description: Coin created }
   *       400: { description: Invalid input }
   *       404: { description: Symbol not found on CoinMarketCap }
   *       409: { description: Symbol already tracked }
   *       502: { description: CoinMarketCap unavailable }
   */
  router.post('/', validateBody(validateCoinCreate), async (req, res, next) => {
    try {
      const { symbol, name } = req.body;
      const coin = await service.add(symbol, name);
      res.status(201).json(coin);
    } catch (e) { next(e); }
  });

  /**
   * @openapi
   * /api/coins/{id}:
   *   put:
   *     summary: Rename a tracked coin (symbol and cmc_id are immutable)
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Coin updated }
   *       400: { description: Invalid input }
   *       404: { description: Coin not found }
   */
  router.put('/:id', validateBody(validateCoinUpdate), async (req, res, next) => {
    try {
      const err = validateIdParam(req.params.id);
      if (err) throw new ValidationError(err, { id: req.params.id });
      const updated = await service.update(Number(req.params.id), req.body.name);
      res.json(updated);
    } catch (e) { next(e); }
  });

 /**
   * @openapi
   * /api/coins/{id}:
   *   delete:
   *     summary: Stop tracking a coin (cascades to price history)
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       204: { description: Deleted }
   *       400: { description: Invalid id }
   *       404: { description: Coin not found }
   */
  router.delete('/:id', async (req, res, next) => {
    try {
      const err = validateIdParam(req.params.id);
      if (err) throw new ValidationError(err, { id: req.params.id });
      await service.remove(Number(req.params.id));
      res.status(204).send();
    } catch (e) { next(e); }
  });

  return router;
}