import { Router } from 'express';
import { CoinService } from '../services/CoinService';
import { validateBody } from '../middleware/validate';
import { validateCoinCreate, validateCoinUpdate, validateIdParam } from '../validators/coinValidator';
import { ValidationError } from '../errors/AppError';

export function coinRoutes(service: CoinService): Router {
  const router = Router();

  //List all tracked coins
  router.get('/', async (_req, res, next) => {
    try {
      res.json(await service.list());
    } catch (e) { next(e); }
  });

  // Get one tracked coin by id
  router.get('/:id', async (req, res, next) => {
    try {
      const err = validateIdParam(req.params.id);
      if (err) throw new ValidationError(err, { id: req.params.id });
      res.json(await service.getById(Number(req.params.id)));
    } catch (e) { next(e); }
  });

  //Start tracking a new coin
  router.post('/', validateBody(validateCoinCreate), async (req, res, next) => {
    try {
      const { symbol, name } = req.body;
      const coin = await service.add(symbol, name);
      res.status(201).json(coin);
    } catch (e) { next(e); }
  });

  //Rename a tracked coin
  router.put('/:id', validateBody(validateCoinUpdate), async (req, res, next) => {
    try {
      const err = validateIdParam(req.params.id);
      if (err) throw new ValidationError(err, { id: req.params.id });
      const updated = await service.update(Number(req.params.id), req.body.name);
      res.json(updated);
    } catch (e) { next(e); }
  });

 //Stop tracking a coin
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