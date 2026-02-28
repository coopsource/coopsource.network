/**
 * SagaCoordinator — orchestrates multi-step distributed operations with compensation.
 *
 * Each saga consists of ordered steps. If any step fails, previously executed
 * steps are compensated in reverse order to maintain consistency.
 */

export interface SagaStep<TContext> {
  name: string;
  execute(ctx: TContext): Promise<void>;
  compensate(ctx: TContext): Promise<void>;
}

export interface SagaLogger {
  info(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

const noopLogger: SagaLogger = {
  info() {},
  error() {},
};

export class SagaCoordinator<TContext> {
  private steps: SagaStep<TContext>[] = [];

  addStep(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  async run(ctx: TContext, logger: SagaLogger = noopLogger): Promise<void> {
    const executed: SagaStep<TContext>[] = [];

    for (const step of this.steps) {
      try {
        logger.info(`Saga step executing: ${step.name}`);
        await step.execute(ctx);
        executed.push(step);
      } catch (error) {
        logger.error(`Saga step failed: ${step.name}`, {
          error: error instanceof Error ? error.message : String(error),
        });

        // Compensate in reverse order
        for (let i = executed.length - 1; i >= 0; i--) {
          const completedStep = executed[i]!;
          try {
            logger.info(`Compensating step: ${completedStep.name}`);
            await completedStep.compensate(ctx);
          } catch (compensateError) {
            logger.error(`Compensation failed: ${completedStep.name}`, {
              error:
                compensateError instanceof Error
                  ? compensateError.message
                  : String(compensateError),
            });
            // Continue compensating remaining steps even if one fails
          }
        }

        throw error;
      }
    }
  }
}
