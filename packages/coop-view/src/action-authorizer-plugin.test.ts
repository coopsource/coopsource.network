import { describe, expect, it } from 'vitest';
import {
  CoopActionAuthorizerPlugin,
  createCoopActionAuthorizerPlugin,
  type CoopActionPermissionReader,
} from './index.js';

const input = {
  actor: { did: 'did:plc:alice' },
  cooperative: {
    authorityDid: 'did:plc:coop',
    spaceKey: 'members',
    spaceType: 'network.coopsource.org.spaceType.members',
  },
  action: 'proposal.open',
  at: '2026-07-06T12:00:00.000Z',
};

describe('CoopActionAuthorizerPlugin', () => {
  it('delegates action authorization to the permission reader', async () => {
    const events: string[] = [];
    const reader: CoopActionPermissionReader = {
      async canActorPerformAction(args) {
        events.push(
          `reader-start:${args.cooperativeDid}:${args.actorDid}:${args.action}:${args.at}`,
        );
        await Promise.resolve();
        events.push('reader-finish');
        return { authorized: true };
      },
    };
    const plugin = createCoopActionAuthorizerPlugin(reader);

    events.push('call-start');
    const result = await plugin.authorize(input);
    events.push('call-finish');

    expect(result).toEqual({ authorized: true });
    expect(events).toEqual([
      'call-start',
      'reader-start:did:plc:coop:did:plc:alice:proposal.open:2026-07-06T12:00:00.000Z',
      'reader-finish',
      'call-finish',
    ]);
  });

  it('returns denied reader decisions with reasons', async () => {
    const plugin = new CoopActionAuthorizerPlugin({
      permissionReader: {
        async canActorPerformAction() {
          return { authorized: false, reason: 'missing-permission' };
        },
      },
    });

    await expect(plugin.authorize(input)).resolves.toEqual({
      authorized: false,
      reason: 'missing-permission',
    });
  });

  it('propagates permission reader failures', async () => {
    const plugin = createCoopActionAuthorizerPlugin({
      async canActorPerformAction() {
        await Promise.resolve();
        throw new Error('permission authority failed');
      },
    });

    await expect(plugin.authorize(input)).rejects.toThrow(
      'permission authority failed',
    );
  });
});
