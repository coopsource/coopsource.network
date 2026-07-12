import {
  createDefaultGovernancePluginSet,
  type GovernancePluginSet,
} from '@coopsource/governance-view';

export class CoopView {
  readonly plugins: GovernancePluginSet;

  constructor(overrides: Partial<GovernancePluginSet> = {}) {
    this.plugins = Object.freeze(createDefaultGovernancePluginSet(overrides));
  }
}
