import { describe, it, expect } from 'vitest';
import { ApiError } from '../src/errors.js';

describe('ApiError', () => {
  it('creates with status, code, and message', () => {
    const err = new ApiError(404, 'NotFound', 'Resource not found');
    expect(err.status).toBe(404);
    expect(err.code).toBe('NotFound');
    expect(err.message).toBe('Resource not found');
  });

  it('has name set to ApiError', () => {
    const err = new ApiError(500, 'InternalError', 'Something went wrong');
    expect(err.name).toBe('ApiError');
  });

  it('is an instance of Error', () => {
    const err = new ApiError(400, 'ValidationError', 'Invalid input');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of ApiError', () => {
    const err = new ApiError(401, 'Unauthorized', 'Not authenticated');
    expect(err).toBeInstanceOf(ApiError);
  });

  it('preserves stack trace', () => {
    const err = new ApiError(500, 'InternalError', 'Oops');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('ApiError');
  });

  it('stores different HTTP status codes', () => {
    const statuses = [400, 401, 403, 404, 409, 422, 500, 502, 503];
    for (const status of statuses) {
      const err = new ApiError(status, 'TestError', `HTTP ${status}`);
      expect(err.status).toBe(status);
      expect(err.message).toBe(`HTTP ${status}`);
    }
  });
});
