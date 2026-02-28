import { describe, it, expect, vi } from 'vitest';
import { SagaCoordinator } from '../src/saga.js';
import type { SagaStep, SagaLogger } from '../src/saga.js';

interface TestContext {
  log: string[];
}

function makeStep(
  name: string,
  opts?: { failOnExecute?: boolean; failOnCompensate?: boolean },
): SagaStep<TestContext> {
  return {
    name,
    async execute(ctx) {
      if (opts?.failOnExecute) {
        throw new Error(`${name} execute failed`);
      }
      ctx.log.push(`${name}:execute`);
    },
    async compensate(ctx) {
      if (opts?.failOnCompensate) {
        throw new Error(`${name} compensate failed`);
      }
      ctx.log.push(`${name}:compensate`);
    },
  };
}

describe('SagaCoordinator', () => {
  it('executes all steps in order when all succeed', async () => {
    const saga = new SagaCoordinator<TestContext>();
    saga.addStep(makeStep('step1'));
    saga.addStep(makeStep('step2'));
    saga.addStep(makeStep('step3'));

    const ctx: TestContext = { log: [] };
    await saga.run(ctx);

    expect(ctx.log).toEqual([
      'step1:execute',
      'step2:execute',
      'step3:execute',
    ]);
  });

  it('compensates step 1 when step 2 fails', async () => {
    const saga = new SagaCoordinator<TestContext>();
    saga.addStep(makeStep('step1'));
    saga.addStep(makeStep('step2', { failOnExecute: true }));

    const ctx: TestContext = { log: [] };
    await expect(saga.run(ctx)).rejects.toThrow('step2 execute failed');

    expect(ctx.log).toEqual(['step1:execute', 'step1:compensate']);
  });

  it('compensates steps 1 and 2 in reverse order when step 3 fails', async () => {
    const saga = new SagaCoordinator<TestContext>();
    saga.addStep(makeStep('step1'));
    saga.addStep(makeStep('step2'));
    saga.addStep(makeStep('step3', { failOnExecute: true }));

    const ctx: TestContext = { log: [] };
    await expect(saga.run(ctx)).rejects.toThrow('step3 execute failed');

    expect(ctx.log).toEqual([
      'step1:execute',
      'step2:execute',
      'step2:compensate',
      'step1:compensate',
    ]);
  });

  it('continues compensating even when a compensation fails', async () => {
    const saga = new SagaCoordinator<TestContext>();
    saga.addStep(makeStep('step1'));
    saga.addStep(makeStep('step2', { failOnCompensate: true }));
    saga.addStep(makeStep('step3', { failOnExecute: true }));

    const ctx: TestContext = { log: [] };

    const logger: SagaLogger = {
      info: vi.fn(),
      error: vi.fn(),
    };

    await expect(saga.run(ctx, logger)).rejects.toThrow(
      'step3 execute failed',
    );

    // step2 compensation failed but step1 should still be compensated
    expect(ctx.log).toEqual([
      'step1:execute',
      'step2:execute',
      'step1:compensate',
    ]);

    // Logger should have logged the compensation failure
    expect(logger.error).toHaveBeenCalledWith(
      'Compensation failed: step2',
      expect.objectContaining({ error: 'step2 compensate failed' }),
    );
  });

  it('does nothing with no steps', async () => {
    const saga = new SagaCoordinator<TestContext>();
    const ctx: TestContext = { log: [] };
    await saga.run(ctx);
    expect(ctx.log).toEqual([]);
  });

  it('step 1 fails without any compensation needed', async () => {
    const saga = new SagaCoordinator<TestContext>();
    saga.addStep(makeStep('step1', { failOnExecute: true }));

    const ctx: TestContext = { log: [] };
    await expect(saga.run(ctx)).rejects.toThrow('step1 execute failed');

    expect(ctx.log).toEqual([]);
  });
});
