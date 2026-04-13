# Inlay Component Developer Guide

> Internal guide for CSN developers adding or modifying Inlay governance components.

---

## Architecture Overview

CSN publishes governance widgets as [Inlay](https://inlay.at) components. Inlay is Dan Abramov's composable UI framework for ATProto — JSON element trees served over XRPC, rendered by host applications (Bluesky, etc.).

**Key constraint**: No client-side JavaScript. Components return server-rendered element trees using `org.atsui.*` primitives. All interactivity is via host-provided primitives (links, tabs, etc.) or deep links to CSN's SvelteKit UI.

### How Inlay Works

1. **Inlay host** (e.g., Bluesky) encounters a component reference
2. Host resolves the component's DID → finds `#inlay` service entry in DID document
3. For **template** components: host fetches the `at.inlay.component` record, resolves `at.inlay.Binding` placeholders against the viewed record
4. For **external** components: host POSTs to `/xrpc/{componentNsid}` on CSN's API, receives `{ node, cache }`
5. Host renders the element tree using native `org.atsui.*` primitives

### Component Types

| Type | `bodyTemplate` | `bodyExternal` |
|---|---|---|
| Server endpoint needed? | No | Yes |
| Data source | PDS record (auto-fetched by host) | CSN's AppView (server-side query) |
| Good for | Displaying fields from a single record | Aggregated data, personalized views, multi-record queries |
| Auth | N/A | Optional viewer JWT for personalized components |

### Auth Architecture

Two separate auth verifiers:

| Verifier | Purpose | Trust model |
|---|---|---|
| `ServiceAuthVerifier` (V9.2.5) | Service-to-service XRPC queries | Trusted issuer whitelist |
| `InlayAuthVerifier` (V9.3) | Inlay viewer personalization | Any DID with valid signature |

Inlay viewer JWTs are obtained by the host via `com.atproto.server.getServiceAuth` from the viewer's PDS. The JWT has `iss` = viewer's DID, `aud` = CSN's DID, `lxm` = component NSID.

---

## Adding a Template Component

Template components are the simplest — no server endpoint, just an ATProto record.

### 1. Build the template tree

Create a file in `apps/api/src/inlay/`:

```typescript
// apps/api/src/inlay/my-component-template.ts
import { $, serializeTree } from '@inlay/core';

export function buildMyComponentTemplate(): unknown {
  const tree = $(
    'org.atsui.Stack', { gap: 'small' },
    $('org.atsui.Title', {},
      $('at.inlay.Binding', { path: ['record', 'title'] }),
    ),
    $('org.atsui.Caption', {},
      $('at.inlay.Binding', { path: ['record', 'status'] }),
    ),
    // Wrap optional fields in at.inlay.Maybe for graceful fallback
    $('at.inlay.Maybe', {},
      $('org.atsui.Caption', {},
        $('at.inlay.Binding', { path: ['record', 'optionalField'] }),
      ),
    ),
  );
  return serializeTree(tree);
}

export function buildMyComponentRecord(): Record<string, unknown> {
  return {
    $type: 'at.inlay.component',
    bodyTemplate: { node: buildMyComponentTemplate() },
    view: {
      prop: 'uri',
      accepts: [{ collection: 'your.lexicon.collection' }],
    },
  };
}
```

### 2. Register the component

Add the record to `apps/api/scripts/register-inlay-components.ts`:

```typescript
COMPONENTS.push({
  rkey: 'MyComponent',
  record: buildMyComponentRecord(),
});
```

Run: `tsx apps/api/scripts/register-inlay-components.ts --pds-url ... --did ... --app-password ...`

### Key patterns

- **Bindings**: `$('at.inlay.Binding', { path: ['record', 'fieldName'] })` — path is an array of strings
- **Optional fields**: Wrap in `$('at.inlay.Maybe', {}, ...)` — renders nothing if the binding doesn't resolve
- **Serialization**: Always call `serializeTree()` — converts internal Symbol brand to JSON-safe `"$"` string

---

## Adding an External Component

External components require a server-side XRPC procedure handler.

### 1. Write the handler

```typescript
// apps/api/src/xrpc/handlers/inlay-my-component.ts
import { $, serializeTree } from '@inlay/core';
import type { XrpcContext } from '../dispatcher.js';

export async function handleInlayMyComponent(ctx: XrpcContext): Promise<unknown> {
  const cooperativeDid = ctx.params.did as string;
  const viewerDid = ctx.viewer?.did; // Set by InlayAuthVerifier for personalized components

  // Query data from existing services
  const data = await ctx.container.someService.getData(cooperativeDid);

  // Build element tree
  const tree = serializeTree(
    $('org.atsui.Stack', { gap: 'small' },
      $('org.atsui.Title', {}, data.name),
      $('org.atsui.Caption', {}, data.description),
    ),
  );

  return {
    node: tree,
    cache: {
      life: 'minutes', // 'seconds' | 'minutes' | 'hours' | 'max'
      tags: [
        { uri: `at://${cooperativeDid}/your.collection` },
      ],
    },
  };
}
```

### 2. Register in the handler map

```typescript
// apps/api/src/xrpc/index.ts
import { handleInlayMyComponent } from './handlers/inlay-my-component.js';

handlers.set('network.coopsource.inlay.MyComponent', {
  method: 'procedure',           // POST, not GET
  auth: 'inlay-viewer',          // or 'none' for non-personalized
  rateLimit: { windowMs: FIFTEEN_MINUTES, limit: 200 },
  handler: handleInlayMyComponent,
});
```

### 3. Register the component record

Add to `register-inlay-components.ts`:

```typescript
COMPONENTS.push({
  rkey: 'MyComponent',
  record: {
    $type: 'at.inlay.component',
    bodyExternal: {
      did: 'did:web:coopsource.network', // CSN's component server DID
      personalized: true,                // false for non-personalized
    },
    view: {
      prop: 'did',
      accepts: [{ type: 'string', format: 'did' }],
    },
  },
});
```

---

## Available `org.atsui.*` Primitives

19 primitives available for building element trees:

| Primitive | Purpose | Key props |
|---|---|---|
| `Text` | Inline text | `children` |
| `Heading` | Section label | `children` |
| `Title` | Primary heading | `children` |
| `Caption` | Secondary text | `children` |
| `Stack` | Vertical layout | `gap`, `align`, `justify`, `separator` |
| `Row` | Horizontal layout | `gap`, `align`, `justify` |
| `Grid` | Column grid | `columns`, `gap` |
| `Link` | Hyperlink | `uri`, `decoration`, `children` |
| `Avatar` | Profile image | `did`, `size` |
| `Blob` | Image display | `src`, `did`, `ratio`, `fit` |
| `Timestamp` | Date/time | `value` (ISO datetime string) |
| `List` | Paginated list | `query` (NSID), `input` |
| `Tabs` | Tabbed content | `items: [{ key, label, content }]` |
| `Clip` | Aspect-ratio container | `min`, `max`, `children` |
| `Cover` | Background image | `did`, `src` |
| `Cluster` | Circle-packed layout | `children` |
| `Fill` | Space filler | `children` |
| `Record` | Generic record renderer | `uri` |
| `Editor` | Template editor | `uri` |

**Gap values**: `'none'`, `'small'`, `'medium'`, `'large'`
**Align values**: `'start'`, `'center'`, `'end'`, `'stretch'`

---

## Auth for Personalized Components

When a handler is registered with `auth: 'inlay-viewer'`, the dispatcher:

1. Checks for `Authorization: Bearer <jwt>` header
2. Verifies the JWT via `InlayAuthVerifier`:
   - Validates `aud` (must match CSN's DID), `lxm` (must match the method NSID), `exp` (with 30s clock skew)
   - Resolves the issuer's DID document and verifies the ES256 signature against the `#atproto` key
   - **No trusted-issuer whitelist** — any DID with a valid signature is accepted
3. Sets `ctx.viewer = { did: viewerDid, displayName: '' }`
4. Handler uses `ctx.viewer.did` for personalized queries

If no Bearer token is present, the request is rejected with 401.

---

## Cache Policies

External component responses include a `cache` object:

```typescript
{
  life: 'seconds' | 'minutes' | 'hours' | 'max',
  tags: Array<{ uri: string }>,  // AT-URIs for cache invalidation
}
```

**Important**: Personalized components (`personalized: true`) bypass Inlay's cache entirely — every request hits CSN's API. Declare cache tags anyway for any downstream cache layers.

**Guidelines**:
- Active proposals: `life: 'seconds'` (tallies change frequently)
- Membership status: `life: 'minutes'`
- Officer lists: `life: 'hours'`
- Tag with the AT-URIs of records that would invalidate the cache

---

## Testing

### Template components

```typescript
// apps/api/tests/inlay-my-component.test.ts
import { describe, it, expect } from 'vitest';
import { buildMyComponentTemplate } from '../src/inlay/my-component-template.js';

describe('MyComponent template', () => {
  it('serializes to a valid element tree', () => {
    const tree = buildMyComponentTemplate() as Record<string, unknown>;
    expect(tree['$']).toBe('$');           // serialized BRAND
    expect(tree['type']).toBeDefined();     // root NSID
  });
});
```

### External components

```typescript
// Use the supertest + InlayAuthVerifier pattern from inlay-membership-status.test.ts
const verifier = new InlayAuthVerifier(mockResolver, audienceDid);
testApp = createTestApp({ xrpcRouteOptions: { inlayAuthVerifier: verifier } });

const token = await mintViewerJwt({ keypair, iss: viewerDid, aud: audienceDid, lxm });
const res = await bare
  .post('/xrpc/network.coopsource.inlay.MyComponent')
  .set('Authorization', `Bearer ${token}`)
  .send({ did: coopDid })
  .expect(200);

expect(res.body.node).toBeDefined();
expect(res.body.cache).toBeDefined();
```

---

## Key Files

| File | Purpose |
|---|---|
| `packages/federation/src/atproto/inlay-auth-verifier.ts` | Viewer JWT verification (no issuer whitelist) |
| `apps/api/src/xrpc/dispatcher.ts` | XRPC router — GET for queries, POST for procedures |
| `apps/api/src/xrpc/index.ts` | Handler registration map |
| `apps/api/src/xrpc/handlers/inlay-*.ts` | External component handlers |
| `apps/api/src/inlay/*-template.ts` | Template component tree builders |
| `apps/api/scripts/register-inlay-components.ts` | CLI to publish component records to PDS |
| `apps/api/src/routes/well-known.ts` | DID document with `#inlay` service entry |

---

## Inlay Source Reference

Local copy: `/Users/alan/projects/utm/vmshared/inlay`

Key files in the Inlay source:
- `lexicons/at/inlay/component.json` — component record schema
- `lexicons/at/inlay/defs.json` — element/response/cache types
- `lexicons/at/inlay/Binding.json` — binding placeholder schema
- `lexicons/at/inlay/Maybe.json` — graceful fallback component
- `lexicons/org/atsui/*.json` — UI primitive schemas
- `data/xrpc.ts` — how the host calls external components
- `data/resolve.ts` — DID → `#inlay` service URL resolution
- `packages/@inlay/core/` — `$()`, `serializeTree()`, element types
