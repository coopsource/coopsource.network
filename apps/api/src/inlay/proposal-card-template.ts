import { $, serializeTree } from '@inlay/core';

/**
 * Build the ProposalCard template element tree.
 *
 * This is a bodyTemplate component — the Inlay host fetches the proposal
 * record from the cooperative's PDS and resolves bindings against the record
 * fields. No server endpoint needed.
 *
 * Displays: title, status, voting type, creation date, and (if resolved)
 * resolution date. Vote tally is an AppView aggregate not in the PDS record,
 * so it's not included in the template — a companion external component
 * can be added later for live tallies.
 */
export function buildProposalCardTemplate(): unknown {
  const tree = $(
    'org.atsui.Stack', { gap: 'small' },
    $('org.atsui.Title', {},
      $('at.inlay.Binding', { path: ['record', 'title'] }),
    ),
    $('org.atsui.Row', { gap: 'small' },
      $('org.atsui.Caption', {},
        $('at.inlay.Binding', { path: ['record', 'status'] }),
      ),
      $('org.atsui.Caption', {},
        $('at.inlay.Binding', { path: ['record', 'votingType'] }),
      ),
    ),
    // Cast note: Timestamp.value expects a string at runtime, but at template
    // build time the value is a Binding element that the host resolves later.
    // The `as unknown as string` cast bridges this type gap at the serialization
    // boundary — the Inlay host will substitute the actual datetime string.
    $('org.atsui.Row', { gap: 'small' },
      $('org.atsui.Caption', {}, 'Created: '),
      $('org.atsui.Timestamp', {
        value: $('at.inlay.Binding', { path: ['record', 'createdAt'] }) as unknown as string,
      }),
    ),
    $('at.inlay.Maybe', {},
      $('org.atsui.Row', { gap: 'small' },
        $('org.atsui.Caption', {}, 'Resolved: '),
        $('org.atsui.Timestamp', {
          value: $('at.inlay.Binding', { path: ['record', 'resolvedAt'] }) as unknown as string,
        }),
      ),
    ),
  );

  return serializeTree(tree);
}

/**
 * Build the at.inlay.component record for ProposalCard.
 */
export function buildProposalCardComponentRecord(): Record<string, unknown> {
  return {
    $type: 'at.inlay.component',
    bodyTemplate: {
      node: buildProposalCardTemplate(),
    },
    view: {
      prop: 'uri',
      accepts: [
        { collection: 'network.coopsource.governance.proposal' },
      ],
    },
  };
}
