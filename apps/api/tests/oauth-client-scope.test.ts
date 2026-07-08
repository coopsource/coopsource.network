import { describe, expect, it } from 'vitest';
import {
  DRAFT_PERMISSIONED_SPACE_APPVIEW_READ_SCOPES,
  DRAFT_PERMISSIONED_SPACE_WRITE_SCOPES,
  oauthScopeForConfig,
} from '../src/auth/oauth-client.js';

describe('oauthScopeForConfig', () => {
  it('keeps existing OAuth scopes for the private-record writer', () => {
    const scope = oauthScopeForConfig({
      PERMISSIONED_RECORD_WRITER_MODE: 'private-record',
    });

    expect(scope).toContain('rpc:network.coopsource.governance');
    expect(scope).not.toContain('space:');
  });

  it('adds draft space read and write scopes for the draft XRPC writer', () => {
    const scope = oauthScopeForConfig({
      PERMISSIONED_RECORD_WRITER_MODE: 'draft-xrpc',
    });
    const scopes = scope.split(' ');

    expect(
      DRAFT_PERMISSIONED_SPACE_APPVIEW_READ_SCOPES.length,
    ).toBeGreaterThan(0);
    expect(DRAFT_PERMISSIONED_SPACE_WRITE_SCOPES.length).toBeGreaterThan(0);
    expect(scopes).toContain('rpc:network.coopsource.governance');
    expect(scopes.some((value) => value.startsWith('space:'))).toBe(true);
    expect(scopes.some((value) => value.includes('authority=*'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=read'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=create'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=delete'))).toBe(true);
    expect(scopes.some((value) => value.includes('action=update'))).toBe(false);
  });
});
