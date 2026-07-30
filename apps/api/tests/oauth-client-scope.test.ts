import { describe, expect, it } from 'vitest';
import {
  DRAFT_PERMISSIONED_SPACE_APPVIEW_READ_SCOPES,
  DRAFT_PERMISSIONED_SPACE_MANAGEMENT_SCOPES,
  DRAFT_PERMISSIONED_SPACE_WRITE_SCOPES,
  oauthScopeForConfig,
} from '../src/auth/oauth-client.js';

describe('oauthScopeForConfig', () => {
  it('keeps existing OAuth scopes for the private-record writer', () => {
    const scope = oauthScopeForConfig({
      PERMISSIONED_RECORD_WRITER_MODE: 'private-record',
      PERMISSIONED_REPO_READER_MODE: 'fail-closed',
    });

    expect(scope).toContain('rpc:network.coopsource.governance');
    expect(scope).not.toContain('space:');
  });

  it('adds draft space read and write scopes for the draft XRPC writer', () => {
    const scope = oauthScopeForConfig({
      PERMISSIONED_RECORD_WRITER_MODE: 'draft-xrpc',
      PERMISSIONED_REPO_READER_MODE: 'fail-closed',
    });
    const scopes = scope.split(' ');

    expect(DRAFT_PERMISSIONED_SPACE_APPVIEW_READ_SCOPES.length).toBeGreaterThan(
      0,
    );
    expect(DRAFT_PERMISSIONED_SPACE_WRITE_SCOPES.length).toBeGreaterThan(0);
    expect(DRAFT_PERMISSIONED_SPACE_MANAGEMENT_SCOPES).toEqual([
      'space:network.coopsource.org.spaceType.members?authority=*&skey=members&manage=create&manage=update',
    ]);
    expect(scopes).toContain('rpc:network.coopsource.governance');
    expect(scopes.some((value) => value.startsWith('space:'))).toBe(true);
    expect(scopes.some((value) => value.includes('authority=*'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=read'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=create'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=update'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=delete'))).toBe(true);
    expect(scopes.some((value) => value.includes('manage=create'))).toBe(true);
    expect(scopes.some((value) => value.includes('manage=update'))).toBe(true);
    expect(scopes.some((value) => value.includes('manage=delete'))).toBe(false);
  });

  it('adds draft space scopes for a reader with the legacy writer disabled', () => {
    const scope = oauthScopeForConfig({
      PERMISSIONED_RECORD_WRITER_MODE: 'private-record',
      PERMISSIONED_REPO_READER_MODE: 'draft-xrpc',
    });

    expect(scope).toContain('action=read');
    expect(scope).not.toContain('action=create');
    expect(scope).not.toContain('manage=update');
  });
});
