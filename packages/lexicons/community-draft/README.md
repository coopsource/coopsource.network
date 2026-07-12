# Community Governance Draft Lexicons

These schemas are working drafts for the proposed
`community.lexicon.governance.*` namespace. They are not canonical Lexicon
Community schemas and have not been approved for publication.

The drafts are deliberately excluded from `lex:generate`, `lexiconSchemas`,
`LEXICON_IDS`, and the runtime validator. Applications must continue using the
checked-in `network.coopsource.*` schemas until the community process settles
the namespace and record shapes.

Changes here require design review. Do not add CSN-specific cooperative,
patronage, member-class, tax, or legal fields; those belong in CoopView records
or sidecars.

## Draft Invariants

- Indexers must verify `proposerDid`, `voterDid`, and `authorDid` against the
  record owner encoded by the repository or permissioned-space record URI.
  Record payload identity fields are not independently authoritative.
- An election is a metadata sidecar for a proposal. Candidate IDs are proposal
  vote choices; the proposal owns eligibility, timing, status, and outcome.
- A log-head signature covers the canonical DAG-CBOR map of every record field
  except `signature`. Verifiers reject unknown `version` values before checking
  the signature.
- Public summaries use opaque proposal keys and must never expose permissioned
  proposal URIs or member identifiers.
