/**
 * bcrypt cost factor. Reduced in test environment for speed —
 * each setupAndLogin call does bcrypt hash + compare, and test files
 * like agreements.test.ts run this 22 times in beforeEach hooks.
 */
export const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;
