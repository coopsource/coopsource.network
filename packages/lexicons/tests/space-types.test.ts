import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CSN_MEMBER_CLASS_SPACE_TYPE,
  CSN_MEMBERS_SPACE_TYPE,
  CSN_ROLE_SPACE_TYPE,
  CSN_SPACE_TYPE_DECLARATIONS,
  lexiconSchemas,
  type SpaceTypeDeclaration,
} from '../src/index.js';

const sourceFiles = [
  '../network/coopsource/org/spaceType/members.json',
  '../network/coopsource/org/spaceType/role.json',
  '../network/coopsource/org/spaceType/memberClass.json',
];

async function readSourceDeclaration(
  path: string,
): Promise<SpaceTypeDeclaration> {
  const url = new URL(path, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8')) as SpaceTypeDeclaration;
}

describe('Proposal 0016 space type declarations', () => {
  it('exports the canonical CSN space type NSIDs', () => {
    expect(CSN_MEMBERS_SPACE_TYPE).toBe(
      'network.coopsource.org.spaceType.members',
    );
    expect(CSN_ROLE_SPACE_TYPE).toBe('network.coopsource.org.spaceType.role');
    expect(CSN_MEMBER_CLASS_SPACE_TYPE).toBe(
      'network.coopsource.org.spaceType.memberClass',
    );
  });

  it('keeps typed exports aligned with source JSON declarations', async () => {
    const sourceDeclarations = await Promise.all(
      sourceFiles.map(readSourceDeclaration),
    );

    expect([...CSN_SPACE_TYPE_DECLARATIONS].sort(byId)).toEqual(
      sourceDeclarations.sort(byId),
    );
  });

  it('does not mix draft space declarations into generated record schemas', () => {
    const generatedIds = lexiconSchemas.map((schema) => schema.id);

    expect(generatedIds).not.toContain(CSN_MEMBERS_SPACE_TYPE);
    expect(generatedIds).not.toContain(CSN_ROLE_SPACE_TYPE);
    expect(generatedIds).not.toContain(CSN_MEMBER_CLASS_SPACE_TYPE);
  });
});

function byId(a: SpaceTypeDeclaration, b: SpaceTypeDeclaration): number {
  return a.id.localeCompare(b.id);
}
