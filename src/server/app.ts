import express, { type RequestHandler } from 'express';
import cors from 'cors';
import type { CryptoOperations } from '../crypto/index.js';
import type { FileService } from '../domain/fileService.js';
import type { StorageBackend } from '../types/storage.js';
import { createRoutes } from './routes.js';
import { errorHandler, notFoundHandler } from './errors.js';

/**
 * Dependencies required to construct the API app.
 */
export interface AppDependencies {
  readonly fileService: FileService;
  readonly crypto: CryptoOperations;
  readonly storage: StorageBackend;
  readonly tokenKey?: Uint8Array;
  readonly corsOrigin: string | string[] | boolean;
  readonly maxUploadBytes: number;
}

/**
 * Creates the Express app without starting the server.
 */
export function createApp(deps: AppDependencies): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: deps.corsOrigin,
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-nearbytes-secret'],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger());

  app.use(createRoutes(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function requestLogger(): RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
    });
    next();
  };
}
