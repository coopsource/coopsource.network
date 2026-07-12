export type GovernanceProposalLifecycleAction =
  | 'edit'
  | 'open'
  | 'close'
  | 'vote'
  | 'resolve';

export type GovernanceProposalExpiryAction = 'close' | 'resolve';

export type GovernanceProposalLifecycleDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly currentStatus: string;
      readonly requiredStatus: 'draft' | 'open' | 'closed';
    };

const REQUIRED_STATUS: Readonly<
  Record<GovernanceProposalLifecycleAction, 'draft' | 'open' | 'closed'>
> = {
  edit: 'draft',
  open: 'draft',
  close: 'open',
  vote: 'open',
  resolve: 'closed',
};

export function evaluateGovernanceProposalAction(
  status: string,
  action: GovernanceProposalLifecycleAction,
): GovernanceProposalLifecycleDecision {
  const requiredStatus = REQUIRED_STATUS[action];
  return status === requiredStatus
    ? { allowed: true }
    : { allowed: false, currentStatus: status, requiredStatus };
}

export function planGovernanceProposalExpiry(
  status: string,
): ReadonlyArray<GovernanceProposalExpiryAction> {
  if (status === 'open') return ['close', 'resolve'];
  if (status === 'closed') return ['resolve'];
  return [];
}
