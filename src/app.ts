import express, { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { authMiddleware } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { coinRoutes } from './routes/coins';
import { priceRoutes } from './routes/prices';
import { CoinService } from './services/CoinService';
import { CoinRepository } from './repositories/CoinRepository';
import { PriceRepository } from './repositories/PriceRepository';
import { CoinMarketCapService } from './services/CoinMarketCapService';

export interface AppDeps {
  service?: CoinService;
}

export function createApp(deps: AppDeps = {}): Express {
  const service =
    deps.service ??
    new CoinService(new CoinRepository(), new PriceRepository(), new CoinMarketCapService());

  const app = express();
  app.use(express.json());

  //  Swagger 
  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Crypto Tracker API (CoinMarketCap)',
        version: '1.0.0',
        description:
          'Tracks cryptocurrency prices via CoinMarketCap. All prices are quoted in USD.',
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    apis: ['./src/routes/*.ts'],
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/swagger.json', (_req, res) => res.json(swaggerSpec));

  //  Public routes 
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  //  Protected routes 
  app.use('/api/coins', authMiddleware, coinRoutes(service));
  app.use('/api/coins', authMiddleware, priceRoutes(service));

  //  Terminal handlers 
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}