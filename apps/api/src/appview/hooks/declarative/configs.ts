/**
 * Declarative hook configs for 12 collections.
 *
 * Each config exactly matches the behavior of the hand-written indexer
 * it replaces. The 6 complex indexers (membership x2, proposal x2,
 * agreement x2) remain as hand-written builtin hooks.
 */

import type { DeclarativeHookConfig } from './types.js';

// ─── Admin indexers ─────────────────────────────────────────────────────
// All: update-only, soft-delete on invalidated_at, indexed_at column

export const adminOfficerConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.admin.officer',
  targetTable: 'admin_officer',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'soft-delete',
  softDeleteColumn: 'invalidated_at',
  fieldMappings: [
    { recordField: 'status', column: 'status', defaultValue: 'active' },
  ],
  indexedAtColumn: 'indexed_at',
};

export const complianceItemConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.admin.complianceItem',
  targetTable: 'compliance_item',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'soft-delete',
  softDeleteColumn: 'invalidated_at',
  fieldMappings: [
    { recordField: 'status', column: 'status', defaultValue: 'pending' },
  ],
  indexedAtColumn: 'indexed_at',
};

export const memberNoticeConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.admin.memberNotice',
  targetTable: 'member_notice',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'soft-delete',
  softDeleteColumn: 'invalidated_at',
  fieldMappings: [
    { recordField: 'title', column: 'title' },
    { recordField: 'body', column: 'body' },
  ],
  indexedAtColumn: 'indexed_at',
};

export const fiscalPeriodConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.admin.fiscalPeriod',
  targetTable: 'fiscal_period',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'soft-delete',
  softDeleteColumn: 'invalidated_at',
  fieldMappings: [
    { recordField: 'status', column: 'status', defaultValue: 'open' },
  ],
  indexedAtColumn: 'indexed_at',
};

// ─── Legal indexers ─────────────────────────────────────────────────────
// All: update-only, soft-delete on invalidated_at

export const legalDocumentConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.legal.document',
  targetTable: 'legal_document',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'soft-delete',
  softDeleteColumn: 'invalidated_at',
  fieldMappings: [
    { recordField: 'title', column: 'title' },
    { recordField: 'body', column: 'body', defaultValue: null },
    { recordField: 'status', column: 'status', defaultValue: 'draft' },
  ],
  indexedAtColumn: 'indexed_at',
};

export const meetingRecordConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.legal.meetingRecord',
  targetTable: 'meeting_record',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'soft-delete',
  softDeleteColumn: 'invalidated_at',
  fieldMappings: [
    { recordField: 'title', column: 'title' },
    { recordField: 'minutes', column: 'minutes', defaultValue: null },
    { recordField: 'certifiedBy', column: 'certified_by', defaultValue: null },
  ],
  indexedAtColumn: 'indexed_at',
};

// ─── Alignment indexers ─────────────────────────────────────────────────
// All: update-only, hard-delete

export const interestConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.alignment.interest',
  targetTable: 'stakeholder_interest',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'hard-delete',
  fieldMappings: [
    { recordField: 'interests', column: 'interests', transform: 'json_stringify', defaultValue: [] },
    { recordField: 'contributions', column: 'contributions', transform: 'json_stringify', defaultValue: [] },
    { recordField: 'constraints', column: 'constraints', transform: 'json_stringify', defaultValue: [] },
    { recordField: 'redLines', column: 'red_lines', transform: 'json_stringify', defaultValue: [] },
    { recordField: 'preferences', column: 'preferences', transform: 'json_stringify', defaultValue: {} },
  ],
  indexedAtColumn: 'indexed_at',
  additionalTimestampColumns: ['updated_at'],
};

export const outcomeConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.alignment.outcome',
  targetTable: 'desired_outcome',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'hard-delete',
  fieldMappings: [
    { recordField: 'title', column: 'title' },
    { recordField: 'description', column: 'description', defaultValue: null },
    { recordField: 'category', column: 'category' },
    { recordField: 'successCriteria', column: 'success_criteria', transform: 'json_stringify', defaultValue: [] },
    { recordField: 'stakeholderSupport', column: 'stakeholder_support', transform: 'json_stringify', defaultValue: [] },
    { recordField: 'status', column: 'status', defaultValue: 'proposed' },
  ],
  indexedAtColumn: 'indexed_at',
};

export const interestMapConfig: DeclarativeHookConfig = {
  collection: 'network.coopsource.alignment.interestMap',
  targetTable: 'interest_map',
  primaryKey: { column: 'uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'hard-delete',
  fieldMappings: [
    { recordField: 'alignmentZones', column: 'alignment_zones', transform: 'json_stringify', defaultValue: [] },
    { recordField: 'conflictZones', column: 'conflict_zones', transform: 'json_stringify', defaultValue: [] },
  ],
  indexedAtColumn: 'indexed_at',
};

// ─── External indexers ──────────────────────────────────────────────────
// All: upsert, hard-delete

export const frontpagePostConfig: DeclarativeHookConfig = {
  collection: 'fyi.unravel.frontpage.post',
  targetTable: 'frontpage_post_ref',
  primaryKey: { column: 'post_uri', source: 'event.uri' },
  writeMode: 'upsert',
  deleteStrategy: 'hard-delete',
  fieldMappings: [
    { recordField: 'proposalUri', column: 'proposal_uri', defaultValue: null },
    { recordField: 'title', column: 'title', defaultValue: null },
    { recordField: '$did', column: 'cooperative_did' },
  ],
  indexedAtColumn: 'indexed_at',
};

export const calendarEventConfig: DeclarativeHookConfig = {
  collection: 'community.lexicon.calendar.event',
  targetTable: 'calendar_event_ref',
  primaryKey: { column: 'event_uri', source: 'event.uri' },
  writeMode: 'upsert',
  deleteStrategy: 'hard-delete',
  fieldMappings: [
    { recordField: 'proposalUri', column: 'proposal_uri', defaultValue: null },
    { recordField: 'name', column: 'title', defaultValue: null },
    { recordField: 'startDate', column: 'starts_at', transform: 'date_parse', defaultValue: null },
    { recordField: '$did', column: 'cooperative_did' },
  ],
  indexedAtColumn: 'indexed_at',
};

export const calendarRsvpConfig: DeclarativeHookConfig = {
  collection: 'community.lexicon.calendar.rsvp',
  targetTable: 'calendar_event_ref',
  primaryKey: { column: 'event_uri', source: 'event.uri' },
  writeMode: 'update-only',
  deleteStrategy: 'ignore',
  fieldMappings: [],
  counterMappings: [
    {
      targetTable: 'calendar_event_ref',
      column: 'rsvp_count',
      foreignKey: { recordField: 'event', column: 'event_uri' },
    },
  ],
};

// ─── All configs ────────────────────────────────────────────────────────

export const declarativeConfigs: DeclarativeHookConfig[] = [
  // Admin
  adminOfficerConfig,
  complianceItemConfig,
  memberNoticeConfig,
  fiscalPeriodConfig,
  // Legal
  legalDocumentConfig,
  meetingRecordConfig,
  // Alignment
  interestConfig,
  outcomeConfig,
  interestMapConfig,
  // External
  frontpagePostConfig,
  calendarEventConfig,
  calendarRsvpConfig,
];
