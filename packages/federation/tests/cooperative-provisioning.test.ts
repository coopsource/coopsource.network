import { describe, it, expect } from 'vitest';
import { generateKeyPair, publicJwkToMultibase } from '../src/local/did-manager.js';

describe('Cooperative provisioning', () => {
  describe('key generation', () => {
    it('should generate a valid ECDSA P-256 keypair', async () => {
      const { publicJwk, privateJwk } = await generateKeyPair();

      expect(publicJwk.kty).toBe('EC');
      expect(publicJwk.crv).toBe('P-256');
      expect(publicJwk.x).toBeDefined();
      expect(publicJwk.y).toBeDefined();
      expect(publicJwk.d).toBeUndefined(); // public key has no private component

      expect(privateJwk.kty).toBe('EC');
      expect(privateJwk.crv).toBe('P-256');
      expect(privateJwk.d).toBeDefined(); // private key has d component
    });

    it('should generate unique keypairs on each call', async () => {
      const kp1 = await generateKeyPair();
      const kp2 = await generateKeyPair();

      expect(kp1.publicJwk.x).not.toBe(kp2.publicJwk.x);
      expect(kp1.privateJwk.d).not.toBe(kp2.privateJwk.d);
    });
  });

  describe('multibase encoding', () => {
    it('should produce a z-prefixed multibase string', async () => {
      const { publicJwk } = await generateKeyPair();
      const multibase = publicJwkToMultibase(publicJwk);

      expect(multibase).toMatch(/^z[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
    });

    it('should produce consistent output for the same key', async () => {
      const { publicJwk } = await generateKeyPair();
      const mb1 = publicJwkToMultibase(publicJwk);
      const mb2 = publicJwkToMultibase(publicJwk);

      expect(mb1).toBe(mb2);
    });

    it('should throw for JWK without coordinates', () => {
      expect(() => publicJwkToMultibase({ kty: 'EC', crv: 'P-256' })).toThrow(
        'JWK must have x and y coordinates',
      );
    });
  });

  describe('PLC genesis operation format', () => {
    it('should produce a valid genesis operation structure', async () => {
      const { publicJwk } = await generateKeyPair();
      const signingKey = publicJwkToMultibase(publicJwk);

      const genesisOp = {
        type: 'plc_operation',
        rotationKeys: [signingKey],
        verificationMethods: {
          atproto: signingKey,
        },
        alsoKnownAs: ['at://mycoop.coop'],
        services: {
          atproto_pds: {
            type: 'AtprotoPersonalDataServer',
            endpoint: 'https://pds.mycoop.coop',
          },
        },
        prev: null,
      };

      // Validate the structure matches PLC directory expectations
      expect(genesisOp.type).toBe('plc_operation');
      expect(genesisOp.prev).toBeNull();
      expect(genesisOp.rotationKeys).toHaveLength(1);
      expect(genesisOp.rotationKeys[0]).toMatch(/^z/);
      expect(genesisOp.verificationMethods.atproto).toMatch(/^z/);
      expect(genesisOp.alsoKnownAs[0]).toMatch(/^at:\/\//);
      expect(genesisOp.services.atproto_pds.type).toBe(
        'AtprotoPersonalDataServer',
      );
    });
  });
});
