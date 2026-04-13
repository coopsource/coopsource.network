#!/usr/bin/env tsx
/**
 * Register Inlay component records in CSN's PDS repo.
 *
 * Usage:
 *   tsx apps/api/scripts/register-inlay-components.ts \
 *     --pds-url http://localhost:2583 \
 *     --did did:web:coopsource.network \
 *     --app-password <password>
 *
 * This publishes at.inlay.component records so the Inlay ecosystem can
 * discover CSN's governance widgets.
 */

import { AtpAgent } from '@atproto/api';
import { buildProposalCardComponentRecord } from '../src/inlay/proposal-card-template.js';

interface Args {
  pdsUrl: string;
  did: string;
  appPassword: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '');
    const value = args[i + 1];
    if (key && value) map.set(key, value);
  }

  const pdsUrl = map.get('pds-url');
  const did = map.get('did');
  const appPassword = map.get('app-password');

  if (!pdsUrl || !did || !appPassword) {
    console.error('Usage: register-inlay-components --pds-url <url> --did <did> --app-password <password>');
    process.exit(1);
  }

  return { pdsUrl, did, appPassword };
}

const COMPONENTS: Array<{ rkey: string; record: Record<string, unknown> }> = [
  {
    rkey: 'ProposalCard',
    record: buildProposalCardComponentRecord(),
  },
  {
    rkey: 'MembershipStatus',
    record: {
      $type: 'at.inlay.component',
      bodyExternal: {
        did: 'did:web:coopsource.network',
        personalized: true,
      },
      view: {
        prop: 'did',
        accepts: [{ type: 'string', format: 'did' }],
      },
    },
  },
  {
    rkey: 'OfficerList',
    record: {
      $type: 'at.inlay.component',
      bodyExternal: {
        did: 'did:web:coopsource.network',
        personalized: false,
      },
      view: {
        prop: 'did',
        accepts: [{ type: 'string', format: 'did' }],
      },
    },
  },
  {
    rkey: 'GovernanceFeed',
    record: {
      $type: 'at.inlay.component',
      bodyExternal: {
        did: 'did:web:coopsource.network',
        personalized: false,
      },
      view: {
        prop: 'did',
        accepts: [{ type: 'string', format: 'did' }],
      },
    },
  },
  {
    rkey: 'VoteWidget',
    record: {
      $type: 'at.inlay.component',
      bodyExternal: {
        did: 'did:web:coopsource.network',
        personalized: true,
      },
      view: {
        prop: 'uri',
        accepts: [{ collection: 'network.coopsource.governance.proposal' }],
      },
    },
  },
];

async function main() {
  const { pdsUrl, did, appPassword } = parseArgs();

  const agent = new AtpAgent({ service: pdsUrl });
  await agent.login({ identifier: did, password: appPassword });

  console.log(`Registering ${COMPONENTS.length} Inlay component(s) for ${did}...`);

  for (const { rkey, record } of COMPONENTS) {
    try {
      const result = await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: 'at.inlay.component',
        rkey,
        record,
      });
      console.log(`  ✓ ${rkey} → ${result.data.uri}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${rkey}: ${message}`);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
