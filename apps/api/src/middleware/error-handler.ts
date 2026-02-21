import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@coopsource/common';
import { logger } from './logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
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
    res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
    return;
  }

  logger.error(err, 'Unhandled error');
  res.status(500).json({
    error: 'InternalError',
    message: 'Internal server error',
  });
};
