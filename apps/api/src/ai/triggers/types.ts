export interface TriggerCondition {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt';
  value: unknown;
}

export interface TriggerAction {
  type: 'agent_message' | 'call_webhook' | 'notify';
  config: Record<string, unknown>;
}
