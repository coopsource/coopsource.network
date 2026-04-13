import { describe, it, expect } from 'vitest';
import { buildProposalCardTemplate, buildProposalCardComponentRecord } from '../src/inlay/proposal-card-template.js';

describe('ProposalCard Inlay template', () => {
  it('builds a serialized element tree', () => {
    const tree = buildProposalCardTemplate();
    expect(tree).toBeDefined();
    expect(typeof tree).toBe('object');
  });

  it('root element is org.atsui.Stack', () => {
    const tree = buildProposalCardTemplate() as Record<string, unknown>;
    // serializeTree converts the Symbol BRAND to the string "$"
    expect(tree['$']).toBe('$');
    expect(tree['type']).toBe('org.atsui.Stack');
  });

  it('contains Binding elements for record fields', () => {
    const json = JSON.stringify(buildProposalCardTemplate());
    expect(json).toContain('at.inlay.Binding');
    expect(json).toContain('record');
    expect(json).toContain('title');
    expect(json).toContain('status');
    expect(json).toContain('createdAt');
  });

  it('wraps resolvedAt in at.inlay.Maybe for graceful fallback', () => {
    const json = JSON.stringify(buildProposalCardTemplate());
    expect(json).toContain('at.inlay.Maybe');
    expect(json).toContain('resolvedAt');
  });

  it('builds a valid component record with view declaration', () => {
    const record = buildProposalCardComponentRecord();
    expect(record.$type).toBe('at.inlay.component');
    expect(record.bodyTemplate).toBeDefined();
    const bodyTemplate = record.bodyTemplate as { node: unknown };
    expect(bodyTemplate.node).toBeDefined();

    const view = record.view as { prop: string; accepts: Array<{ collection: string }> };
    expect(view.prop).toBe('uri');
    expect(view.accepts[0]?.collection).toBe('network.coopsource.governance.proposal');
  });
});
