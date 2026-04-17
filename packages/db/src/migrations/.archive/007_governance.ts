import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // proposal — governance proposals within a cooperative
  await db.schema
    .createTable('proposal')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text', (col) => col.unique())
    .addColumn('cid', 'text')
    .addColumn('cooperative_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('author_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('body_format', 'text', (col) =>
      col.notNull().defaultTo('markdown'),
    )
    .addColumn('voting_type', 'text', (col) =>
      col.notNull().defaultTo('binary'),
    )
    .addColumn('options', 'jsonb')
    .addColumn('quorum_type', 'text', (col) =>
      col.notNull().defaultTo('simpleMajority'),
    )
    .addColumn('quorum_basis', 'text', (col) =>
      col.notNull().defaultTo('votesCast'),
    )
    .addColumn('quorum_threshold', sql.raw('numeric(4,3)'))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('outcome', 'text')
    .addColumn('opens_at', 'timestamptz')
    .addColumn('closes_at', 'timestamptz')
    .addColumn('resolved_at', 'timestamptz')
    .addColumn('tags', sql`text[]`, (col) =>
      col.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('created_by', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('invalidated_at', 'timestamptz')
    .addColumn('invalidated_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE proposal
      ADD CONSTRAINT proposal_voting_type_check
      CHECK (voting_type IN ('binary', 'approval', 'ranked'));
  `.execute(db);

  await sql`
    ALTER TABLE proposal
      ADD CONSTRAINT proposal_quorum_type_check
      CHECK (quorum_type IN ('simpleMajority', 'superMajority', 'unanimous', 'custom'));
  `.execute(db);

  await sql`
    ALTER TABLE proposal
      ADD CONSTRAINT proposal_quorum_basis_check
      CHECK (quorum_basis IN ('votesCast', 'totalMembers'));
  `.execute(db);

  await sql`
    ALTER TABLE proposal
      ADD CONSTRAINT proposal_status_check
      CHECK (status IN ('draft', 'open', 'closed', 'resolved', 'withdrawn'));
  `.execute(db);

  await sql`
    ALTER TABLE proposal
      ADD CONSTRAINT proposal_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('passed', 'failed', 'no_quorum'));
  `.execute(db);

  // vote — votes on proposals
  await db.schema
    .createTable('vote')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn('uri', 'text', (col) => col.unique())
    .addColumn('cid', 'text')
    .addColumn('proposal_id', 'uuid', (col) =>
      col.notNull().references('proposal.id'),
    )
    .addColumn('proposal_uri', 'text', (col) => col.notNull())
    .addColumn('proposal_cid', 'text', (col) => col.notNull())
    .addColumn('voter_did', 'text', (col) =>
      col.notNull().references('entity.did'),
    )
    .addColumn('choice', 'text', (col) => col.notNull())
    .addColumn('rationale', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .addColumn('retracted_at', 'timestamptz')
    .addColumn('retracted_by', 'text', (col) =>
      col.references('entity.did'),
    )
    .addColumn('indexed_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`NOW()`),
    )
    .execute();

  await sql`
    ALTER TABLE vote
      ADD CONSTRAINT vote_proposal_voter_unique
      UNIQUE (proposal_id, voter_did);
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('vote').execute();
  await db.schema.dropTable('proposal').execute();
}
