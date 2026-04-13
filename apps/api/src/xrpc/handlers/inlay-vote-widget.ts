import { $, serializeTree } from '@inlay/core';
import { AppError, NotFoundError } from '@coopsource/common';
import type { XrpcContext } from '../dispatcher.js';
import { assertGovernanceAccess } from './open-governance-gate.js';
import { checkVoteEligibility } from './check-vote-eligibility.js';

/**
 * Inlay external component: VoteWidget (personalized).
 *
 * Shows proposal details, live vote tally, and the viewer's eligibility
 * status. Display-only — actual voting happens via deep link to CSN's
 * SvelteKit UI (Inlay has no mutation model yet, RFC 008 stage-1).
 *
 * POST /xrpc/network.coopsource.inlay.VoteWidget
 * Body: { uri: proposalAtUri }
 * Auth: personalized (viewer JWT via InlayAuthVerifier)
 * Returns: { node, cache }
 */
export async function handleInlayVoteWidget(
  ctx: XrpcContext,
): Promise<unknown> {
  const uri = ctx.params.uri as string;
  if (!uri) {
    throw new AppError('Missing proposal URI', 400, 'InvalidRequest');
  }

  const viewerDid = ctx.viewer!.did;

  const result = await ctx.container.proposalService.getProposalByUri(uri);
  if (!result) {
    throw new NotFoundError('Proposal not found');
  }

  const { proposal, voteSummary } = result;

  // Governance access check — also gives us coop.handle for the deep link
  const { coop, viewerMembership } = await assertGovernanceAccess(
    ctx.container.db,
    proposal.cooperative_did,
    ctx.viewer,
    ctx.container.membershipService,
  );

  // Eligibility check (reuse shared logic with getVoteEligibility XRPC handler)
  const eligibility = await checkVoteEligibility(
    ctx.container.db,
    ctx.container.membershipService,
    ctx.container.delegationVotingService,
    proposal,
    viewerDid,
    viewerMembership,
  );

  // Build tally rows
  const tallyEntries = Object.entries(voteSummary);
  const tallyRows = tallyEntries.length > 0
    ? tallyEntries.map(([choice, count]) =>
        $('org.atsui.Row', { gap: 'small' },
          $('org.atsui.Caption', {}, choice),
          $('org.atsui.Caption', {}, String(count)),
        ),
      )
    : [$('org.atsui.Caption', {}, 'No votes yet')];

  // Eligibility display
  let eligibilityText: string;
  if (eligibility.eligible) {
    eligibilityText = 'You can vote on this proposal';
  } else if (eligibility.reason === 'already_voted') {
    eligibilityText = 'You have already voted';
  } else if (eligibility.reason === 'not_active_member') {
    eligibilityText = 'Members only';
  } else {
    eligibilityText = 'Voting has ended';
  }

  // Deep link to CSN's SvelteKit UI
  const handle = coop.handle ?? coop.did;
  const deepLinkUrl = `/coop/${handle}/governance/${proposal.id}`;

  const children = [
    $('org.atsui.Title', {}, proposal.title),
    $('org.atsui.Caption', {}, proposal.status === 'open' ? 'Open for voting' : proposal.status),
    ...tallyRows,
    $('org.atsui.Caption', {}, eligibilityText),
  ];

  // Show delegation weight if > 1
  if (eligibility.weight > 1) {
    children.push(
      $('org.atsui.Caption', {}, `Vote weight: ${eligibility.weight} (includes delegations)`),
    );
  }

  // Deep link for voting action
  if (eligibility.eligible) {
    children.push(
      $('org.atsui.Link', { uri: deepLinkUrl }, 'Vote now'),
    );
  } else if (eligibility.reason !== 'not_active_member') {
    children.push(
      $('org.atsui.Link', { uri: deepLinkUrl }, 'View proposal'),
    );
  }

  const tree = serializeTree(
    $('org.atsui.Stack', { gap: 'small' }, ...children),
  );

  return {
    node: tree,
    cache: {
      life: 'seconds',
      tags: [
        { uri: `at://${proposal.cooperative_did}/network.coopsource.governance.proposal` },
        { uri: `at://${proposal.cooperative_did}/network.coopsource.governance.vote` },
      ],
    },
  };
}
