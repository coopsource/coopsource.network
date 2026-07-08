import type { ActionAuthorizerPlugin } from '@coopsource/governance-view';
import type { CoopActionPermissionReader } from './ports.js';

export interface CoopActionAuthorizerPluginOptions {
  readonly permissionReader: CoopActionPermissionReader;
}

export class CoopActionAuthorizerPlugin implements ActionAuthorizerPlugin {
  constructor(private readonly options: CoopActionAuthorizerPluginOptions) {}

  async authorize(
    input: Parameters<ActionAuthorizerPlugin['authorize']>[0],
  ): ReturnType<ActionAuthorizerPlugin['authorize']> {
    return this.options.permissionReader.canActorPerformAction({
      cooperativeDid: input.cooperative.authorityDid,
      actorDid: input.actor.did,
      action: input.action,
      at: input.at,
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    });
  }
}

export function createCoopActionAuthorizerPlugin(
  permissionReader: CoopActionPermissionReader,
): ActionAuthorizerPlugin {
  return new CoopActionAuthorizerPlugin({ permissionReader });
}
