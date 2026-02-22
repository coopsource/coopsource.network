import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@coopsource/common';
import { logger } from './logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    logger.debug({ method: req.method, path: req.path }, 'Validation error');
    res.status(400).json({
      error: 'ValidationError',
      message: 'Validation failed',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, method: req.method, path: req.path }, 'App error');
    }
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
    return;
  }

  logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: 'InternalError',
    message: 'Internal server error',
  });
};
