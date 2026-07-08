export interface SpaceTypeDeclaration {
  readonly lexicon: 1;
  readonly id: string;
  readonly defs: {
    readonly main: {
      readonly type: 'space';
      readonly description?: string;
      readonly key: string;
      readonly name: string;
      readonly 'name:lang'?: Readonly<Record<string, string>>;
      readonly collections: readonly string[];
    };
  };
}

export const CSN_MEMBERS_SPACE_TYPE =
  'network.coopsource.org.spaceType.members';
export const CSN_ROLE_SPACE_TYPE = 'network.coopsource.org.spaceType.role';
export const CSN_MEMBER_CLASS_SPACE_TYPE =
  'network.coopsource.org.spaceType.memberClass';

export const CSN_SPACE_TYPE_DECLARATIONS = [
  {
    lexicon: 1,
    id: CSN_MEMBERS_SPACE_TYPE,
    defs: {
      main: {
        type: 'space',
        description:
          'A cooperative membership space used as the authority boundary for member-visible Co-op Source records.',
        key: 'literal:members',
        name: 'Co-op Source Members',
        collections: [
          'network.coopsource.org.memberConsent',
          'network.coopsource.governance.proposal',
          'network.coopsource.governance.vote',
          'network.coopsource.agreement.master',
          'network.coopsource.agreement.signature',
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: CSN_ROLE_SPACE_TYPE,
    defs: {
      main: {
        type: 'space',
        description:
          'A cooperative role-scoped space used as the authority boundary for records visible to a named role.',
        key: 'any',
        name: 'Co-op Source Role',
        collections: [
          'network.coopsource.admin.memberNotice',
          'network.coopsource.legal.document',
          'network.coopsource.legal.meetingRecord',
          'network.coopsource.finance.expense',
          'network.coopsource.finance.revenue',
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: CSN_MEMBER_CLASS_SPACE_TYPE,
    defs: {
      main: {
        type: 'space',
        description:
          'A cooperative member-class-scoped space used as the authority boundary for class-specific records.',
        key: 'any',
        name: 'Co-op Source Member Class',
        collections: [
          'network.coopsource.agreement.stakeholderTerms',
          'network.coopsource.agreement.contribution',
          'network.coopsource.funding.pledge',
          'network.coopsource.ops.timeEntry',
        ],
      },
    },
  },
] as const satisfies readonly SpaceTypeDeclaration[];
