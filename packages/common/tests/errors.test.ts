import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from '../src/errors.js';

describe('AppError', () => {
  it('creates with default values', () => {
    const err = new AppError('something broke');
    expect(err.message).toBe('something broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('InternalError');
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('creates with custom status and code', () => {
    const err = new AppError('custom', 418, 'Teapot');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('Teapot');
  });
});

describe('NotFoundError', () => {
  it('has correct defaults', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NotFound');
    expect(err.message).toBe('Not found');
    expect(err).toBeInstanceOf(AppError);
  });

  it('accepts custom message', () => {
    const err = new NotFoundError('User not found');
    expect(err.message).toBe('User not found');
  });
});

describe('UnauthorizedError', () => {
  it('has correct defaults', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('Unauthorized');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('ValidationError', () => {
  it('has correct defaults', () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('ValidationError');
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('ConflictError', () => {
  it('has correct defaults', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('Conflict');
    expect(err).toBeInstanceOf(AppError);
  });
});
