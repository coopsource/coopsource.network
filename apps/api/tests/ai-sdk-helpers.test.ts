import { describe, it, expect } from 'vitest';
import { detectDoomLoop, createRepairToolCall } from '../src/ai/chat-engine.js';

describe('AI SDK Helpers', () => {
  // ─── Doom Loop Detection ──────────────────────────────────────────────

  describe('detectDoomLoop', () => {
    it('returns false for fewer than 3 steps', () => {
      expect(detectDoomLoop({ steps: [] })).toBe(false);
      expect(detectDoomLoop({ steps: [makeStep('a', { x: 1 })] })).toBe(false);
      expect(
        detectDoomLoop({
          steps: [makeStep('a', { x: 1 }), makeStep('a', { x: 1 })],
        }),
      ).toBe(false);
    });

    it('returns true for 3 identical tool calls', () => {
      const steps = [
        makeStep('list-members', { limit: 10 }),
        makeStep('list-members', { limit: 10 }),
        makeStep('list-members', { limit: 10 }),
      ];
      expect(detectDoomLoop({ steps })).toBe(true);
    });

    it('returns false for different tool names', () => {
      const steps = [
        makeStep('list-members', { limit: 10 }),
        makeStep('get-member', { did: 'test' }),
        makeStep('list-members', { limit: 10 }),
      ];
      expect(detectDoomLoop({ steps })).toBe(false);
    });

    it('returns false for same tool but different inputs', () => {
      const steps = [
        makeStep('list-members', { limit: 10 }),
        makeStep('list-members', { limit: 20 }),
        makeStep('list-members', { limit: 10 }),
      ];
      expect(detectDoomLoop({ steps })).toBe(false);
    });

    it('only checks last 3 steps', () => {
      const steps = [
        makeStep('get-member', { did: 'abc' }),
        makeStep('list-members', { limit: 5 }),
        makeStep('list-members', { limit: 5 }),
        makeStep('list-members', { limit: 5 }),
      ];
      expect(detectDoomLoop({ steps })).toBe(true);
    });
  });

  // ─── Tool Repair ──────────────────────────────────────────────────────

  describe('createRepairToolCall', () => {
    it('repairs uppercase tool name to lowercase', async () => {
      const tools = { 'list-members': {} };
      const repair = createRepairToolCall(tools);

      const result = await repair({
        toolCall: {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'List-Members',
          input: '{}',
        },
        error: new Error('No such tool'),
      });

      expect(result).not.toBeNull();
      expect(result?.toolName).toBe('list-members');
    });

    it('returns null when tool cannot be repaired', async () => {
      const tools = { 'list-members': {} };
      const repair = createRepairToolCall(tools);

      const result = await repair({
        toolCall: {
          type: 'tool-call',
          toolCallId: '1',
          toolName: 'nonexistent-tool',
          input: '{}',
        },
        error: new Error('No such tool'),
      });

      expect(result).toBeNull();
    });
  });
});

// Helper to create step-like objects for doom loop testing
function makeStep(toolName: string, input: Record<string, unknown>) {
  return {
    toolCalls: [{ toolName, input }],
  };
}
