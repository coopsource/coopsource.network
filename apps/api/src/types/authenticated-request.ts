import type { Request } from 'express';
import type { Agent } from '@atproto/api';

export interface AuthenticatedRequest extends Request {
  agent: Agent;
  did: string;
}
