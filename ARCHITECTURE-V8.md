# ARCHITECTURE-V8.md — Home, Profiles, Public Web & Discovery

> **Prerequisite**: V7 (production deployment + extensibility — Ozone replacement, V3 cleanup, hook pipeline, declarative configs, scripting, MCP) is complete and merged.
> **Design references**: ARCHITECTURE-V7.md (extensibility), ARCHITECTURE-V6.md (federation), ARCHITECTURE-V5.md (cooperative lifecycle, security model)
> **Date**: April 2026
> **Status**: Design — implementation planned in phases V8.1–V8.9

---

## Executive Summary

V7 delivered the production deployment story and unified the data pipeline. V8 reframes Co-op Source from "a tool for running cooperatives" into **"a federated personal space connected to cooperatives"**. The shift is conceptual but has deep architectural consequences.

**The reframe in one sentence:** Users don't log in to a productivity app — they log in to **Home**, a customizable personal space they inhabit, from which they branch out into cooperatives, discover others, and (eventually) host real-time gatherings in shared XR environments.

V8 introduces four new pillars:

1. **Home** — A persistent, customizable personal space replacing the static dashboard. Lexicon-driven widgets, eventual XR-extensibility, eventual co-presence with invited guests.
2. **Profiles** — A presentation layer over a single canonical DID. Users have one verified default profile and optional persona profiles (e.g., "web developer" vs "embedded systems"). All authority (voting, signing, governance) stays at the DID level.
3. **Public Web** — Anonymous-accessible landing page, co-op directory, and discovery surface. Visibility is enforced by an expanded set of flags on each cooperative.
4. **Discovery & Matchmaking** — Search service (Postgres full-text initially) covering cooperatives, people, and alignment data. Background matchmaking service surfaces relevant cooperatives, people, and content based on alignment, interests, and outcomes.

Plus two supporting pillars:

5. **Visibility Foundation** — Audit and enforce existing visibility flags, expand them with discoverability and inter-coop sharing flags, define visibility tiers (anon, authed, member, officer, cross-coop, owner).
6. **Entity Editing** — Reuse existing create modals and form pages to support editing for the 13 entities that currently only allow creation (proposals, agreements, tasks, expenses, etc.). State-machine gating (e.g., proposals editable in draft state but locked once voting opens). Establishes a consistent pattern across all entity surfaces.

---

## 1. Motivation

### What's wrong today

The application currently has three distinct UX surfaces that don't cohere:

| Surface | Layout | Sidebar | Use case |
|---------|--------|---------|----------|
| `/dashboard` (after login) | Custom navbar layout, no sidebar | None | Cards grid: My Cooperatives + My Networks + Pending Invitations |
| `/coop/[handle]/*` | AppShell with full sidebar | 3-section (Cooperative, Network, You) | Working inside one cooperative |
| Public web | None | None | Doesn't exist |

This creates several problems:

- **Inconsistent navigation**: The dashboard sidebar is missing, making the post-login experience feel like a different product than the cooperative workspaces.
- **Duplicated content**: The new Profile page (added in the V7 sidebar redesign) has a "My Activity" tab that mirrors the dashboard exactly.
- **No path back**: Once a user enters a cooperative workspace, there is no clear way back to the dashboard short of using the browser back button.
- **No public face**: Anonymous visitors have nowhere to land. There's no marketing page, no co-op directory, no way to learn what the platform is before signing up.
- **No discovery**: Logged-in users have no way to find cooperatives or people relevant to their interests.
- **Missing identity expression**: Users with multiple domains of expertise have only one identity surface to express themselves through.

### What V8 delivers

A coherent three-mode experience:

1. **Anonymous mode** — Public landing page, co-op directory, search, marketing/explainer content. No sidebar; minimal top navigation.
2. **Home mode** — User's customizable personal space. Same sidebar shape as cooperative mode, but the middle section shows Activity, Explore, Matches, and a switchable list of My Coops. The header is a workspace switcher (Slack-style).
3. **Cooperative mode** — Existing 3-section sidebar (Cooperative, Network, You). Header is the same workspace switcher with the current coop highlighted.

Plus:

- A profile data model that supports multiple personas mapped to one canonical DID.
- A visibility model that enforces what anonymous, authenticated non-member, member, and officer users can see at every API boundary.
- A search service that powers both anonymous discovery and authenticated matchmaking.
- A Home layout with lexicon-driven widgets that adapt to viewport size.

---

## 2. Core Concepts

### 2.1 Home

**Home is a place, not a page.** It is the user's customizable personal space — the front door they enter through after login, the surface they return to between cooperative tasks, and (eventually) the 3D environment they inhabit in XR.

Home replaces the current dashboard. Conceptually:

- Users **inhabit** Home — it persists, accumulates state, and reflects the user's identity and interests over time.
- Users **customize** Home — they choose which widgets appear, which feeds are visible, which lexicons drive the content stream.
- Users **leave** Home — they branch out to cooperative workspaces, the explore page, or (future) XR shared spaces.
- Users **invite others** to Home — eventually via video co-presence (FaceTime/StreamPlace integration), and eventually via shared XR environments.

The metaphor is intentional. "Workspace" implies productivity tooling. "Home" implies belonging, persistence, and welcome. The reframe matters because it shapes every downstream feature: a workspace doesn't naturally extend to 3D space, but a home does (it has rooms, things on walls, doors that lead elsewhere, guests who visit).

#### Layout

Home is a multi-region layout with widgets in each region:

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  Greeting (Welcome back, Alan)                           │
│                                                          │
├──────────────────────────────────┬──────────────────────┤
│                                  │                      │
│                                  │   Right Rail         │
│   Main Feed                      │   (widget column)    │
│   (lexicon-driven content)       │                      │
│                                  │   - Suggested        │
│   - Posts from coops             │     Matches          │
│   - Posts from followed people   │   - Pending          │
│   - AI-ranked content            │     Invitations      │
│                                  │   - My Coops list    │
│                                  │   - External feeds   │
│                                  │     (Bluesky, etc.)  │
│                                  │                      │
└──────────────────────────────────┴──────────────────────┘
```

The layout adapts responsively:
- Large desktop: full multi-column with right rail
- Small desktop / tablet: feed center, widgets below or in collapsible drawer
- Mobile: single column, widgets accessed via tab or drawer

#### Widget System (V8.2 Hardcoded → Future Lexicon-Driven)

A widget is conceptually `{ lexicon, filter, layout, position }`:

- **lexicon**: The collection it queries (e.g., `network.coopsource.governance.proposal`, `app.bsky.feed.post`, `community.lexicon.calendar.event`)
- **filter**: Constraints on the query (e.g., `cooperative_did = ?`, `created_after = ?`, `tag IN (?)`)
- **layout**: How the records render (`card`, `list`, `feed`, `compact`, `calendar`)
- **position**: Where it sits on Home (`feed-main`, `right-rail`, `top-strip`)

This is a powerful abstraction because the V7 hook pipeline already stores all federation records in the generic `pds_record` table indexed by collection. Every collection in the system is automatically a potential widget source.

**V8 ships with 4-6 hardcoded widgets** (no registry, no customization UI yet):

1. **My Activity Feed** — Posts from coops the user is a member of, sorted reverse-chronologically (later: AI-ranked)
2. **Suggested Matches** — Top 3-5 matches from the matchmaking service (V8.7+)
3. **Pending Invitations** — Cards showing co-op invitations (with accept/decline)
4. **My Coops List** — Quick-launcher cards for cooperatives the user belongs to
5. **Coop Activity (per-coop)** — One per active coop, showing recent activity inside that coop
6. **External Feeds** — Bluesky timeline (later: Tangled commits, WhiteWind blogs, ecosystem feeds)

**Future (V8.X+)**:
- Widget registry: Dynamic registration of widget types
- Widget marketplace: Cooperatives can publish widget definitions for their members to install
- Drag-and-drop customization: Users pick lexicons and filters from a UI, drag them into Home regions
- Widget settings: Per-widget filters, refresh intervals, display options
- Lexicon picker: Browse all registered lexicons, preview matching records, install as a widget
- Per-profile Home configuration: Each profile (see §2.2) has its own widget layout

#### Future XR Extensions (post-V8)

V8 lays the conceptual groundwork for XR Home environments without building them. The naming choice ("Home" not "Workspace") is the foundational decision. Future:

- **Spatial Home**: A 3D environment representing the user's Home, with widgets as objects in the space (a calendar on the wall, a feed scrolling on a table, photos of co-op members on shelves)
- **Visiting**: Other users can be invited to visit. They appear as avatars in the Home space.
- **Doors**: Each cooperative the user belongs to is represented as a door. Walking through the door enters the cooperative's spatial workspace.
- **Co-presence sessions**: Live video calls happen in Home with avatars, screen-sharing, and shared widgets.
- **Hosting tools**: Configurable invitation lists, guest permissions, "open for visitors" status.

None of this is built in V8. But Home is the hook, and the data model is designed to extend.

### 2.2 Profiles

**One DID per user. One verified default profile. Multiple optional personas.**

Profiles are a presentation layer, not a security boundary. The DID is the canonical identity — voting, signing, governance authority, and federation all happen at the DID level. Profiles only affect how the user *appears* outwardly when interacting with cooperatives, posting, or being viewed by others.

#### Why profiles?

Many users have multiple domains of expertise or interest that don't naturally cohere under one identity. A web developer who is also an embedded systems engineer wants both communities to take her seriously in their context. A civic activist who is also a fiction writer wants her writing readers to see her writing persona, not her advocacy persona, when they encounter her in a literary co-op.

Today, users would need separate accounts (and separate DIDs) to express these different facets — losing reputation, voting power, and history every time they switch.

V8 introduces profiles as a way to express multiple presentations of one identity without fragmenting the DID.

#### The model

```
User Account
  ├── Canonical DID (one)
  │
  ├── Profile: "Default" (verified)
  │     ├── handle: alan.coop
  │     ├── displayName: Alan Smith
  │     ├── avatar: ...
  │     ├── bio: "Real-name profile"
  │     ├── verified: true
  │     ├── rate-limited renames (max 1 per 90 days)
  │     └── Home configuration
  │
  ├── Profile: "Web Dev"
  │     ├── handle: alan-webdev.coop  (or @alan/webdev)
  │     ├── displayName: Alan (Web)
  │     ├── avatar: ... (different)
  │     ├── bio: "TypeScript, SvelteKit, 10 years"
  │     ├── verified: false
  │     ├── linked to default DID (visible on click-through)
  │     └── Home configuration
  │
  └── Profile: "Embedded"
        ├── handle: alan-embed.coop
        ├── displayName: Alan (Embedded)
        ├── avatar: ...
        ├── bio: "C, Rust, ARM Cortex-M, 8 years"
        ├── verified: false
        ├── linked to default DID
        └── Home configuration
```

#### Key invariants

1. **One DID per user account.** Profiles share it. Switching profiles never changes the DID.
2. **Default profile is verified.** It carries the user's real identity. Verification mechanism is TBD (phone, gov ID, social proof, web-of-trust). Display attributes are rate-limited.
3. **Other profiles are personas.** They can be created and renamed freely. They cannot be the default profile unless explicitly promoted.
4. **Authority is per-DID, not per-profile.** Voting, signing, governance, membership, and reputation accumulate against the DID. Switching profiles never changes any of these.
5. **DID is always discoverable.** Anyone who interacts with a profile can click through to see the canonical DID and verified default profile. Profiles are not anonymity tools — they are presentation tools.
6. **Current profile state.** At any time, the user has an "active" profile. It determines the handle, avatar, and display name shown to others when they interact through the platform.
7. **Per-profile Home configuration.** Each profile has its own Home layout, widget set, and content preferences.

#### Profile-aware operations

When the user takes an action:

- **Posting**: The post is authored by the DID, but the displayed author is the current profile's display attributes.
- **Voting**: The vote is recorded against the DID. The current profile is irrelevant.
- **Signing an agreement**: The signature is recorded against the DID. The current profile is irrelevant.
- **Joining a cooperative**: Membership is recorded against the DID. The cooperative might display the joining member's current profile attributes in member lists.
- **Receiving invitations**: Invitations target the DID. The user sees them on Home regardless of which profile is active.

#### Cooperative member display

When a cooperative renders its member list, each member is displayed using their current profile's display attributes — but with a clickable indicator showing the canonical identity behind the profile. This means:

- A coop member list might show "Alan (Web)" if Alan was using his Web Dev profile when he joined and last interacted.
- Clicking on "Alan (Web)" reveals "Alan Smith — verified default profile, DID did:plc:abc123".
- Other members can choose to address Alan by his current profile or his canonical name.

**Future option**: A cooperative could decide to enforce default-profile-only display, requiring all members to be shown by their verified identity within that coop. This would be a per-coop visibility setting.

#### V8 implementation scope

V8.3 ships with **the `profile` data model and one default profile per user**. The UI exposes a profile dropdown affordance in the sidebar footer, but the dropdown is a single-item shell — there is no profile switching, no profile creation, no rename, and no activation in V8.3.

This means:
- The `profile` table supports multi-profile from day one (the schema has `is_default`, `verified`, `last_renamed_at`, etc.)
- `/api/v1/auth/me` returns the user's default profile inline alongside `did`/`handle`/`displayName`/`roles`
- The default profile is always "the current profile" in V8.3 — no separate session state, no `currentProfileId`
- The dropdown affordance is in place so users see the path; the multi-profile machinery comes in V8.X

**V8.X+ delivers**:
- Profile creation UI + `POST /api/v1/me/profiles` endpoint
- Profile switcher in Home/sidebar (multi-item dropdown)
- `currentProfileId` session state + `POST /api/v1/me/profiles/[id]/activate` endpoint
- `PATCH /api/v1/me/profiles/[id]` with rate-limited renames
- `profile.handle` column with explicit uniqueness semantics
- Verification mechanism for default profile + `verified_via` distinction
- Click-through DID disclosure UI
- `MembershipService` LEFT JOIN to profile for cross-coop persona display

**Future work captured for later**:
- True multi-DID alts (separate identities under one account) — not supported, deliberate design choice
- Verification mechanisms (KYC, web-of-trust, social attestation)
- Per-profile reputation scores
- Per-profile content visibility filters (a viewer of "civic me" sees only my civic posts)
- Per-coop profile policies (e.g., "this coop requires default-profile display")
- Profile-specific membership filtering
- Cross-profile activity aggregation on Home

### 2.3 Public Web & Anonymous Mode

V8 introduces a real public face for Co-op Source. Anonymous visitors can:

- Land on a marketing page that explains what Co-op Source is, the recursive cooperative model, and the goals of the platform
- Browse a directory of publicly-discoverable cooperatives
- View public profile pages for cooperatives that have opted into discoverability
- Search public cooperatives by name, description, location, alignment interests
- Read public proposals, agreements, and content from cooperatives that have opted in
- Sign up or log in via prominent CTAs

#### Visibility model

V8 expands the existing 5 visibility flags (`publicDescription`, `publicMembers`, `publicActivity`, `publicAgreements`, `publicCampaigns`) with a small set of additional flags and defines visibility tiers:

**Visibility tiers** (in order of access):
1. **Anonymous** — No authentication
2. **Authenticated** — Logged-in user, not a member of this coop
3. **Cross-coop member** — Authenticated user who is a member of another cooperative (relationship may grant additional access)
4. **Member** — Active bilateral member of this cooperative
5. **Officer** — Member with admin/officer/owner role
6. **Owner** — Highest role tier (creator or designated owner)

**New flags** (added in V8.1):

| Flag | Default | Purpose |
|------|---------|---------|
| `anonDiscoverable` | `false` | Whether this coop appears in the public directory and search results for anonymous users. Coops can opt in to be public-facing. |
| `crossCoopVisible` | `true` | Whether other cooperatives' members can see this coop's profile. |
| `requireDefaultProfile` | `false` | Whether this coop requires members to be displayed by their default verified profile (not personas). (Deferred to V8.X.) |

**Existing flags retained**: `publicDescription`, `publicMembers`, `publicActivity`, `publicAgreements`, `publicCampaigns`. Each flag controls a distinct piece of cooperative data and applies at the **anonymous tier**. Higher tiers automatically have access to data they would have at lower tiers.

**Enforcement**: Every API endpoint that returns cooperative data takes the requesting user's tier into account. Helper utilities at the query layer check tier and filter accordingly. A reusable `applyVisibility(query, tier)` function gates access at the data boundary.

**Field-level visibility**: V8 does not introduce field-level visibility flags. The 8-flag model handles aggregate visibility. Field-level (e.g., "show member emails to officers only") is deferred to a future version.

#### Public layout

Anonymous mode uses a different layout than authenticated mode. There is no sidebar — the layout is a top navigation bar plus content area. This is intentional: the sidebar is workspace-scoped, and an anonymous user has no workspace.

**Components**:
- Top nav: Logo, "Explore" link, "About" link, "Sign in" / "Sign up" CTAs
- Footer: Links, legal, ATProto badge
- Main content: Marketing or directory or co-op profile page
- No sidebar
- No avatar/user widget

**Routes** (all unauthenticated):
- `/` — Marketing landing page
- `/explore` — Co-op directory + search
- `/explore/[coop-handle]` — Public coop profile (if `anonDiscoverable=true`)
- `/about` — Static explainer content
- `/login`, `/register` — Existing routes, possibly restyled to match the public layout

### 2.4 Discovery & Matchmaking

V8 introduces a search and matchmaking system that powers both anonymous browsing and authenticated discovery.

#### Search service

A `SearchService` class provides query operations over indexed entities:

```typescript
interface SearchService {
  searchCooperatives(query: SearchQuery, tier: VisibilityTier): SearchResult<Cooperative>;
  searchPeople(query: SearchQuery, tier: VisibilityTier): SearchResult<Person>;
  searchPosts(query: SearchQuery, tier: VisibilityTier): SearchResult<Post>;
  searchAlignment(query: SearchQuery, tier: VisibilityTier): SearchResult<AlignmentMatch>;
}
```

**Implementation**: Postgres full-text search (FTS) using `tsvector`/`tsquery`. No external search engine needed at the V8 scale. Index columns:

- `cooperative_profile`: name, description, location, alignment summary
- `entity` (people): displayName, handle, bio
- `pds_record` (posts): text content (for `network.coopsource.org.post` and `app.bsky.feed.post`)
- `stakeholder_interest`: interest text (for matchmaking queries)

**Visibility integration**: Every search query includes the requesting user's tier. The query layer adds `WHERE` clauses to filter out records the user can't see (e.g., anon search excludes coops with `anonDiscoverable=false`).

**API endpoints**:
- `GET /api/v1/search/cooperatives?q=...&tags=...&location=...` — Anon-allowed
- `GET /api/v1/search/people?q=...&interests=...` — Authed-only, gated by visibility
- `GET /api/v1/search/posts?q=...&coop=...` — Tier-gated
- `GET /api/v1/search/alignment?interests=...&outcomes=...` — Authed-only, returns matched entities

#### Matchmaking service

A `MatchmakingService` class runs background scoring jobs to find relevant matches for each user. It's separate from the search service but shares the same index.

**Match types**:
1. **Cooperative matches**: Coops the user might want to join, scored by alignment overlap, geographic proximity, shared connections.
2. **People matches**: People the user might want to connect with, scored by complementary skills, shared interests, mutual coop memberships.
3. **Content matches**: Posts, proposals, or campaigns the user might care about, scored by topic overlap.
4. **Need-to-skill matches**: Co-ops looking for skills the user has (or vice versa).

**Architecture**:
- New `match_suggestion` table: `{ id, user_did, profile_id, match_type, target_uri, score, reason, created_at, dismissed_at, acted_on_at }`
- Background job runs periodically (hourly? daily?) using existing trigger/agent infrastructure
- Job uses the search service to find candidates, then applies a scoring function based on alignment data
- Top N matches per user are inserted into `match_suggestion`
- Old matches are pruned periodically
- Users can dismiss matches (won't be re-suggested)
- Matches are surfaced via the Matches widget on Home and the Matches page

**Scoring signals** (V8.7+):
- Stakeholder interest overlap (Jaccard similarity on interest tags)
- Desired outcome alignment
- Geographic proximity (if location data available)
- Mutual coop memberships
- Shared connections (friend-of-friend)
- Recent activity (active members score higher than inactive)
- Time decay (newer matches favored)

**API endpoints**:
- `GET /api/v1/matches` — User's current match suggestions
- `POST /api/v1/matches/[id]/dismiss` — Dismiss a match
- `POST /api/v1/matches/[id]/act` — Mark a match as acted on (joined, connected, etc.)

#### Lexicon for matches

Matches are stored in PostgreSQL only — they are derived data, not records of authority. They don't go in PDS repos and don't propagate over the firehose.

---

## 3. The Three-Mode UX

V8 establishes three distinct UX modes:

### Mode 1: Anonymous

| Aspect | Detail |
|--------|--------|
| Layout | Top nav, no sidebar, max-width content |
| Header | Logo, Explore, About, Sign in, Sign up |
| Routes | `/`, `/explore`, `/explore/[handle]`, `/about`, `/login`, `/register` |
| Surfaces | Marketing landing, co-op directory, public co-op profiles, search |
| Visibility tier | `anonymous` |

### Mode 2: Home (Authenticated, no current coop)

| Aspect | Detail |
|--------|--------|
| Layout | AppShell with sidebar + main content area + right rail |
| Sidebar header | Workspace switcher (currently "Home", click for dropdown) |
| Sidebar items | Activity, Explore, Matches \| My Coops (list) \| You (Profile, Settings) |
| Routes | `/me`, `/me/explore`, `/me/matches`, `/me/profile`, `/me/settings` |
| Content | Customizable Home layout: greeting, feed, right rail with widgets |
| Visibility tier | `authenticated` (when viewing other coops' content) |

### Mode 3: Cooperative Workspace (Authenticated, current coop selected)

| Aspect | Detail |
|--------|--------|
| Layout | AppShell with sidebar + main content area |
| Sidebar header | Workspace switcher (currently "{Coop Name}", click for dropdown) |
| Sidebar items | Cooperative (Members, Governance, Posts, [Finance, Admin]) \| Network (Networks, Partners, Alignment, Campaigns) \| You (Profile, Settings) |
| Routes | `/coop/[handle]/*` |
| Content | Coop-scoped pages with tabs (Members, Governance, etc.) |
| Visibility tier | `member` or `officer` (based on user's role in the coop) |

### Workspace Switcher

The workspace switcher is the navigation primitive that connects Mode 2 and Mode 3. It lives in the sidebar header and replaces the static label:

```
[Acme Tech ▾]                ← clickable header

Click → dropdown:

  SWITCH TO
  ⌂ Home
  ● Acme Tech (current)
  ● Bay Mesh
  ● Soil Co-op
  ─────
  + Create new coop
```

The switcher is consistent across all three authenticated modes. From Home, the switcher is labeled "Home"; from a coop, it's labeled with the coop name. The dropdown always lists Home plus all coops the user belongs to plus a "Create new" CTA.

This is the standard pattern from Slack, Linear, Notion. Users will recognize it immediately.

**Optional enhancement**: A breadcrumb in the content area (`Home › Acme Tech › Members`) provides a second navigation path. The breadcrumb segments are clickable. This is "belt and suspenders" — recommended but not required for V8.2.

---

## 4. Data Model Changes

### 4.1 New tables

#### `profile` (V8.3)

```sql
CREATE TABLE profile (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_did      TEXT NOT NULL REFERENCES entity(did),
  is_default      BOOLEAN NOT NULL DEFAULT false,
  display_name    TEXT NOT NULL,
  avatar_cid      TEXT,
  bio             TEXT,
  verified        BOOLEAN NOT NULL DEFAULT false,
  last_renamed_at TIMESTAMPTZ,                       -- NULL until first rename; rate-limit driver in V8.X
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invalidated_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_profile_entity_default
  ON profile(entity_did)
  WHERE is_default = true AND invalidated_at IS NULL;
```

Each person has exactly one default profile (enforced by the partial unique index). The default profile's `verified` flag *will* drive the verification tier in V8.X; in V8.3 it is `true` for all profiles since one default profile per user trivially satisfies the §2.2 invariant.

For V8.3, only the default profile is created automatically when an account is created. Multi-profile creation is deferred (V8.X) but the table supports it.

**V8.3 design notes**:

- `entity_did` references `entity(did)`. The `entity.type = 'person'` constraint is enforced at the application layer (not via a CHECK), since the model is conceptually open to other entity types in the future.
- `last_renamed_at` defaults to NULL (not NOW()) so V8.X's rate-limited renames don't accidentally lock out grandfathered users.
- `profile.handle` is intentionally NOT in V8.3. It will be added by V8.X with explicit uniqueness semantics (global unique vs namespaced) once the multi-profile UI exists to define the rule.
- Migration 058 backfills exactly one default profile per active person entity, with `verified=true`, mirroring `entity.display_name` and `entity.avatar_cid`. The backfill is idempotent (`NOT EXISTS` guard) and excludes suspended/deleted/invalidated rows.

#### `home_layout` (V8.2)

```sql
CREATE TABLE home_layout (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profile(id),
  layout_version INT NOT NULL DEFAULT 1,
  config JSONB NOT NULL,           -- widget set, positions, settings
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_home_layout_profile ON home_layout(profile_id);
```

The `config` JSONB stores the per-profile widget configuration:

```json
{
  "widgets": [
    { "id": "feed", "type": "activity-feed", "position": "main", "settings": {} },
    { "id": "matches", "type": "suggested-matches", "position": "right-rail", "settings": { "limit": 5 } },
    { "id": "invitations", "type": "pending-invitations", "position": "right-rail", "settings": {} },
    { "id": "coops", "type": "my-coops-list", "position": "right-rail", "settings": {} }
  ],
  "preferences": {
    "feedAlgorithm": "chronological"
  }
}
```

V8.2 ships with a default layout config inserted on profile creation. Users can't customize yet — but the data structure is in place.

#### `match_suggestion` (V8.7)

```sql
CREATE TABLE match_suggestion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_did TEXT NOT NULL REFERENCES entity(did),
  profile_id UUID REFERENCES profile(id),  -- nullable; some matches are user-level
  match_type TEXT NOT NULL,                -- 'cooperative', 'person', 'content', 'skill'
  target_uri TEXT NOT NULL,                -- AT URI of the matched entity
  score NUMERIC(5,4) NOT NULL,             -- 0.0000 to 1.0000
  reason TEXT,                              -- human-readable explanation
  signals JSONB,                            -- structured data about why it matched
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ
);

CREATE INDEX idx_match_user_score ON match_suggestion(user_did, score DESC) WHERE dismissed_at IS NULL AND acted_on_at IS NULL;
CREATE INDEX idx_match_user_type ON match_suggestion(user_did, match_type, score DESC);
```

### 4.2 Modified tables

#### `cooperative_profile` (V8.1)

Add new visibility flags:

```sql
ALTER TABLE cooperative_profile ADD COLUMN anon_discoverable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cooperative_profile ADD COLUMN cross_coop_visible BOOLEAN NOT NULL DEFAULT true;
```

`require_default_profile` is deferred to V8.X.

### 4.3 Search indexes (V8.6)

Add Postgres FTS indexes:

```sql
ALTER TABLE cooperative_profile ADD COLUMN search_tsv TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(location, '')), 'C')
  ) STORED;

CREATE INDEX idx_cooperative_profile_search ON cooperative_profile USING GIN(search_tsv);
```

Similar indexes added to `entity` (people search) and `pds_record` (post search) in V8.6/V8.8.

---

## 5. API Changes

### 5.1 New endpoints

| Endpoint | Phase | Auth | Purpose |
|----------|-------|------|---------|
| `GET /api/v1/me/home` | V8.2 | Required | Get current user's Home layout config + widget data |
| `PATCH /api/v1/me/home/layout` | V8.X | Required | Update Home layout config |
| `GET /api/v1/auth/me` (extended) | V8.3 | Required | Now includes `profile: { id, displayName, avatarCid, bio, verified } \| null` inline |
| `GET /api/v1/me/profiles` | V8.X | Required | List user's profiles (deferred — no UI consumer in V8.3) |
| `POST /api/v1/me/profiles` | V8.X | Required | Create a new profile (deferred — multi-profile UI is V8.X) |
| `PATCH /api/v1/me/profiles/[id]` | V8.X | Required | Update profile (rate-limited if default, deferred) |
| `POST /api/v1/me/profiles/[id]/activate` | V8.X | Required | Set current profile (deferred — only one profile per user in V8.3) |
| `GET /api/v1/me/matches` | V8.7 | Required | Get current user's match suggestions |
| `POST /api/v1/me/matches/[id]/dismiss` | V8.7 | Required | Dismiss a match |
| `POST /api/v1/me/matches/[id]/act` | V8.7 | Required | Mark match as acted on |
| `GET /api/v1/explore/cooperatives` | V8.4 | Optional | Public co-op directory (anon allowed) |
| `GET /api/v1/explore/cooperatives/[handle]` | V8.5 | Optional | Public co-op profile (anon allowed if discoverable) |
| `GET /api/v1/search/cooperatives` | V8.6 | Optional | Search co-ops (tier-aware) |
| `GET /api/v1/search/people` | V8.8 | Required | Search people |
| `GET /api/v1/search/posts` | V8.6 | Optional | Search posts (tier-aware) |
| `GET /api/v1/search/alignment` | V8.8 | Required | Alignment-based matching query |

### 5.2 Modified endpoints

All existing endpoints that return cooperative data are audited and updated in V8.1 to apply visibility filtering based on the requesting user's tier.

**Helper**: A new `applyVisibility(query, tier, options)` utility in `apps/api/src/services/visibility.ts` is the single point of enforcement. Endpoints call it instead of writing per-flag checks.

```typescript
function applyVisibility<T>(
  query: SelectQueryBuilder<T>,
  tier: VisibilityTier,
  options: { table: 'cooperative_profile' | 'entity' | 'pds_record', cooperativeDid?: string }
): SelectQueryBuilder<T>
```

### 5.3 Authentication tier resolver

A new middleware computes the requesting user's tier per-request:

```typescript
type VisibilityTier = 'anonymous' | 'authenticated' | 'cross-coop' | 'member' | 'officer' | 'owner';

interface RequestTier {
  tier: VisibilityTier;
  userDid?: string;
  cooperativeDid?: string;  // when accessing a specific coop
  roles?: string[];
}

async function resolveTier(req: Request): Promise<RequestTier>
```

This becomes part of the request context and is used by every visibility-aware endpoint.

---

## 6. Frontend Changes

### 6.1 New routes

| Route | Phase | Purpose |
|-------|-------|---------|
| `/` | V8.4 | Marketing landing page (anon) |
| `/explore` | V8.4 | Co-op directory (anon + authed) |
| `/explore/[handle]` | V8.5 | Public co-op profile (anon + authed) |
| `/about` | V8.4 | Static explainer (anon) |
| `/me` | V8.2 | Home (authed) |
| `/me/explore` | V8.6 | Discover (authed) — same data as `/explore` but in personal sidebar |
| `/me/matches` | V8.7 | Matches page (authed) |
| `/me/profile` | V8.3 | Profile management (authed) |
| `/me/settings` | V8.2 | Settings (authed) |

### 6.2 Layout changes

**New layout group**: `(public)` in `apps/web/src/routes/(public)/+layout.svelte` for anon mode. Uses a top nav, no sidebar.

**Modified layout group**: `(authed)/+layout.svelte` for authenticated mode. The AppShell with sidebar wraps everything.

**Removed**: The `/dashboard/+layout.svelte` minimal navbar layout. Dashboard is replaced by `/me`.

### 6.3 Sidebar updates

The sidebar component (`apps/web/src/lib/components/layout/Sidebar.svelte`) is updated to support three modes:

1. **Coop mode** (existing): Cooperative / Network / You sections with current 3-section layout.
2. **Home mode** (new): No top section labels. Items: Activity, Explore, Matches \| My Coops (section, lists each coop) \| You (Profile, Settings).
3. **Anonymous mode**: Sidebar is not rendered. Public layout has no sidebar.

The sidebar header becomes a workspace switcher (clickable, dropdown). The dropdown lists Home + all coops + "Create new coop" CTA.

### 6.4 Home page

A new top-level Home page at `/me/+page.svelte` that:

- Reads the user's `home_layout.config` from the API
- Renders widgets in their configured positions
- Each widget is a Svelte component that loads its own data
- The layout is responsive (CSS grid + media queries)
- V8.2 ships with a hardcoded default layout; customization deferred

### 6.5 Workspace switcher component

A new `WorkspaceSwitcher.svelte` component:

- Replaces the static sidebar header label
- Shows current workspace name + dropdown chevron
- Click opens a dropdown listing Home + all user's coops + "Create new"
- Reuses existing API: `getMyMemberships()` to fetch the coop list
- Highlights the current workspace
- Keyboard accessible (Arrow keys, Enter, Escape)

### 6.6 Profile dropdown

Lives in the sidebar footer (replacing the static user block in `Sidebar.svelte`). Reuses the `WorkspaceSwitcher` dropdown pattern (`clickOutside` action, `Escape`-to-close, capture-phase listener). In V8.3 the dropdown is a **single-item shell** showing the user's default profile + "View profile" / "Settings" links — there is no switcher behavior because there is only one profile per user. V8.X turns it into a real switcher when multi-profile creation lands.

Sign-out is intentionally NOT in this dropdown; it lives in `Navbar.svelte` and is unaffected by V8.3.

---

## 7. Phases

### Phase V8.1 — Visibility Foundation

**Goal**: Audit and enforce visibility on existing endpoints. Add new flags. Drop the `network` workspace type.

**Tasks**:
1. Add `anonDiscoverable` and `crossCoopVisible` columns to `cooperative_profile` (migration 057)
2. Define `VisibilityTier` type and `resolveTier()` middleware
3. Implement `applyVisibility()` helper utility
4. Audit all endpoints in `apps/api/src/routes/` that return cooperative data; apply visibility filtering
5. Drop the `network` workspace type from the sidebar (`workspace.type === 'network'` branch); networks are now coops with `is_network: true` driving variations
6. Tests: visibility enforcement for each tier

**Files**:
- `packages/db/src/migrations/057_add_visibility_flags.ts` (new)
- `apps/api/src/services/visibility.ts` (new)
- `apps/api/src/middleware/tier-resolver.ts` (new)
- `apps/api/src/routes/*` (audit modifications)
- `apps/web/src/lib/components/layout/Sidebar.svelte` (drop network branch)

### Phase V8.2 — Home Foundation

**Goal**: Replace dashboard with Home. Update login redirects. Build workspace switcher. Hardcoded widgets.

**Tasks**:
1. Add `home_layout` table (migration 058)
2. Insert default Home layout for all existing users
3. Create `/me` route with Home page component
4. Create new `(authed)` layout that wraps everything in AppShell with sidebar
5. Update login/register/cooperative-creation to redirect to `/me` instead of `/dashboard`
6. Implement WorkspaceSwitcher component
7. Update Sidebar to support Home mode (Activity/Explore/Matches | My Coops | You)
8. Build hardcoded widgets: ActivityFeed, MyCoopsList, PendingInvitations, SuggestedMatches (placeholder until V8.7)
9. Move Profile page out of `/coop/[handle]/profile/` to `/me/profile/`
10. Delete `/dashboard/+layout.svelte` and `/dashboard/+page.svelte`
11. Tests: Home page renders, workspace switcher navigates correctly

**Files**:
- `packages/db/src/migrations/058_home_layout.ts` (new)
- `apps/api/src/services/home-service.ts` (new)
- `apps/api/src/routes/me.ts` (new)
- `apps/web/src/routes/(authed)/me/+layout.server.ts` (new)
- `apps/web/src/routes/(authed)/me/+page.svelte` (new)
- `apps/web/src/routes/(authed)/me/+page.server.ts` (new)
- `apps/web/src/routes/(authed)/me/profile/+page.svelte` (moved from coop)
- `apps/web/src/routes/(authed)/me/settings/+page.svelte` (moved from coop)
- `apps/web/src/lib/components/layout/WorkspaceSwitcher.svelte` (new)
- `apps/web/src/lib/components/home/widgets/*.svelte` (new — 4-6 widgets)
- `apps/web/src/lib/components/layout/Sidebar.svelte` (Home mode)
- `apps/web/src/routes/login/+page.server.ts` (redirect change)
- `apps/web/src/routes/register/+page.server.ts` (redirect change)
- `apps/web/src/routes/(authed)/cooperative/+page.server.ts` (redirect change)
- `apps/web/src/routes/(authed)/dashboard/` (delete)

### Phase V8.3 — Profile Data Model

**Goal**: Add the `profile` table for **person entities only**. V8.3 ships exactly one default profile per user, and surfaces it as a placeholder dropdown affordance in the sidebar footer. Multi-profile creation, activation, rate-limited renames, and verification mechanisms are deferred to V8.X — they have no observable behavior with one profile per user, and shipping them as scaffolding risks miswiring the design.

**Design notes** (adopted during V8.3 planning, after design review):

- **Person scope only.** Cooperatives already have `cooperative_profile`. The V8.3 `profile` table is created and populated only for `entity.type = 'person'`. The FK is to `entity(did)`; the type filter is enforced at the application layer.
- **`entity_did`, not `user_did`.** The schema convention used elsewhere (e.g., `cooperative_profile.entity_did`) is followed.
- **No `profile.handle` column in V8.3.** `entity.handle` is `UNIQUE` and routes by handle. Adding a nullable, non-unique `profile.handle` creates an ambiguity slot V8.X would need to migrate. V8.X (the multi-profile UI phase) will define profile-handle semantics — global uniqueness vs namespacing — with full design pressure.
- **No "current profile" session state, no activation endpoint, no rename endpoint in V8.3.** With only one default profile per user, the "current profile" is always the default — sourced directly from the database. Session machinery is speculative scaffolding until multi-profile lands.
- **Profile is inlined in `/api/v1/auth/me`**, not exposed via a separate `/api/v1/me/profiles` router. `apps/web/src/hooks.server.ts` already round-trips `/auth/me` per request to populate `event.locals.user`; extending `buildMeResponse` makes the profile available everywhere `user` is, with no new endpoint and no extra fetch.
- **`MembershipService` is NOT updated to JOIN profile in V8.3.** Because backfill mirrors `entity.display_name → profile.display_name`, the JOIN produces zero observable change — pure risk for zero payoff. V8.X (when persona profiles exist) is the right time to introduce it, with a real test case.
- **No `home_layout` re-key task.** V8.2 shipped hardcoded widgets and never created the `home_layout` table. When `home_layout` is eventually built, it should key on `profile_id` from day one.
- **Verification semantics for V8.3.** All V8.3 default profiles are `verified=true` — backfilled rows on the assumption that any pre-V8.3 account is a "real" identity by definition, and new registrations because the default profile *is* the user's canonical identity. The verification mechanism (KYC / web-of-trust / etc.) and the full meaning of `verified=false` for persona profiles arrive in V8.X.
- **`/me/profile` is read-only in V8.3.** Inline editing of profile attributes is V8.10/V8.11 (Entity Editing).

**Tasks**:
1. Add `profile` table (migration **058**) + safe backfill (active persons only, `NOT EXISTS` guard, transaction-wrapped)
2. Add `ProfileTable` to `packages/db/src/schema.ts` and to the `Database` interface
3. Implement `ProfileService` with `getDefaultProfile(did)` and `createDefaultProfile({...})`
4. Wire `ProfileService` into the DI container; inject into `AuthService`
5. Update `AuthService.register()` to create the default profile alongside the entity (wrap in `db.transaction()` for atomicity)
6. Extend `buildMeResponse` in `apps/api/src/routes/auth.ts` to include `profile: { id, displayName, avatarCid, bio, verified } | null` inline
7. Pre-existing fix: type `cooperativeDid` and `membershipId` as `string | null` in `buildMeResponse` and `AuthUser`
8. Add `Profile` interface to `apps/web/src/lib/api/types.ts`; extend `AuthUser` with `profile`
9. Build `ProfileDropdown.svelte` (single-item dropdown shell) mirroring `WorkspaceSwitcher` patterns
10. Update `Sidebar.svelte` to mount `ProfileDropdown` in the footer (replacing the static user block)
11. Update `/me/profile/+page.svelte` with a read-only Current Profile card and updated footer note
12. Tests: profile-service unit, register-creates-profile, `/auth/me` returns profile, ProfileDropdown E2E, `/me/profile` E2E

**Deferred to V8.X (multi-profile UI phase)**:
- `currentProfileId` session state + activation endpoint
- `PATCH /api/v1/me/profiles/[id]` with rate-limited rename
- `POST /api/v1/me/profiles` (create) + multi-profile selection UI
- `GET /api/v1/me/profiles` (list)
- `MembershipService` LEFT JOIN to profile for member display
- `profile.handle` column with uniqueness rule
- `verified_via` column for distinguishing verification origins
- Verification mechanism (KYC / social / web-of-trust)

**Files**:
- `packages/db/src/migrations/058_profile.ts` (new)
- `packages/db/src/schema.ts` (add `ProfileTable`, add to `Database`)
- `apps/api/src/services/profile-service.ts` (new)
- `apps/api/src/services/auth-service.ts` (`register()` creates default profile)
- `apps/api/src/routes/auth.ts` (`buildMeResponse` + `cooperativeDid: string | null` fix)
- `apps/api/src/container.ts` (register `profileService`)
- `apps/web/src/lib/api/types.ts` (`Profile`, `AuthUser.profile`, `cooperativeDid: string | null`)
- `apps/web/src/lib/components/layout/ProfileDropdown.svelte` (new)
- `apps/web/src/lib/components/layout/Sidebar.svelte` (mount `ProfileDropdown`)
- `apps/web/src/routes/(authed)/+layout.svelte` (pass `currentProfile` to Sidebar)
- `apps/web/src/routes/(authed)/me/profile/+page.svelte` (Current Profile card)

### Phase V8.4 — Public Web (Landing + Anon Layout) — _complete_

**Goal**: Give Co-op Source a real public face — anonymous visitors land on a marketing page, browse a directory of publicly-discoverable cooperatives, read about the platform, and convert to sign-up.

**Implementation note**: V8.4 planning discovered that **6 of the 7 originally-listed tasks were already scaffolded incrementally during V8.1-V8.3 work**. The actual V8.4 delta is small and structural: extract a shared `<PublicNav>` component, add `/about`, fix the root `/` → `/me` redirect (was a two-hop through `/dashboard`), and sweep ~30 stale `/dashboard` references that V8.2's reframing left behind. See the V8.4 plan file for the detailed scope.

**Pre-existing scaffolding (already on main when V8.4 started)**:
- `apps/web/src/routes/(public)/+layout.svelte` — public layout with top navbar (using inline `<nav>`)
- `apps/web/src/routes/+page.svelte` — full-viewport marketing landing (with its own embedded nav)
- `apps/web/src/routes/(public)/explore/+page.svelte` and `+page.server.ts` — co-op directory
- `apps/web/src/routes/(public)/explore/[handle]/+page.svelte` — public coop profile
- `apps/api/src/routes/explore.ts` — full GET /explore/cooperatives, /explore/cooperatives/[handle], /explore/networks (261 lines, mounted in app.ts)
- `apps/api/tests/explore.test.ts` — 24 integration tests
- `apps/web/src/routes/(authed)/dashboard/+page.server.ts` — V8.2 added a 301 → /me shim

**V8.4 delta (the actual work)**:
1. Extract `<PublicNav>` shared component (`apps/web/src/lib/components/layout/PublicNav.svelte`) — single source of truth for the anon navbar. Used by both the root landing (full-viewport) and the `(public)/+layout.svelte`. Avoids the hero-layout collision that would happen if the root `/` were moved into the `(public)` group.
2. Standardize anon nav wording: "Sign in" everywhere (renames `(public)` layout's "Log in").
3. Add `/about` static explainer at `apps/web/src/routes/(public)/about/+page.svelte` — three sections covering what Co-op Source is, the recursive cooperative model, and the ATProto federation story.
4. Fix root `/+page.server.ts` to redirect authed users directly to `/me` (single hop, no `/dashboard` intermediate).
5. Sweep stale `/dashboard` references introduced before V8.2's reframing was complete: `+error.svelte` text + link, **27 authed-side `+page.server.ts` no-coop fallbacks** (across `agreements`, `alignment`, `campaigns`, `invitations`, `members`, `networks`, `proposals`, `settings/connections`, `threads`), plus `setup`, `auth/oauth/complete`, and `invite/[token]`. **Keep** `(authed)/dashboard/+page.server.ts` as a 301 stale-bookmark catcher.
6. Retarget the landing's "Create a Cooperative" CTA from `/join` (which redirects to `/login` on setup-complete instances — bait-and-switch) to `/register`.
7. E2E tests in `apps/web/tests/e2e/public.spec.ts` covering anon and authed states of the navbar, the redirect chain, and the error page.

**Deferred to V8.9 (Polish)**:
- Moving `/login` and `/register` into `(public)/` (the arch doc §2.3 line 313 hedges with "possibly restyled"). Their centered-form layouts don't visually want the chrome.
- Mobile navbar polish (overflow at very narrow widths).
- `/dashboard` 301 shim removal — keep as a stale-bookmark catcher.

**Files**:
- `apps/web/src/lib/components/layout/PublicNav.svelte` (new — extracted nav)
- `apps/web/src/routes/(public)/about/+page.svelte` (new)
- `apps/web/tests/e2e/public.spec.ts` (new)
- `apps/web/src/routes/+page.svelte` (modify — use PublicNav, retarget hero CTA)
- `apps/web/src/routes/+page.server.ts` (modify — direct redirect to /me)
- `apps/web/src/routes/+error.svelte` (modify — text + link sweep)
- `apps/web/src/routes/(public)/+layout.svelte` (modify — use PublicNav)
- `apps/web/src/routes/(authed)/{agreements,alignment,campaigns,invitations,members,networks,proposals,settings/connections,threads}/**/+page.server.ts` (modify — 27 files swept)
- `apps/web/src/routes/setup/+page.server.ts`, `auth/oauth/complete/+page.server.ts`, `invite/[token]/+page.server.ts` (modify — sweep)

### Phase V8.5 — Public Co-op Profile Pages — ✅ Shipped

**Goal**: Each co-op gets a public profile page (when discoverable). Visibility enforcement is fully wired up.

**Tasks** (all complete):
1. ✅ `/explore/[handle]` route in `(public)` (was scaffolded V8.1, completed V8.5)
2. ✅ `GET /api/v1/explore/cooperatives/[handle]` reads all five visibility flags + the master `anon_discoverable` switch and returns gated proposals/agreements/campaigns
3. ✅ Renders: name, description, member count (if `publicMembers`), networks + recent proposals (if `publicActivity`), agreements (if `publicAgreements`), campaigns (if `publicCampaigns`)
4. ✅ Admin UI: master `anonDiscoverable` toggle added as the first/labeled control in the visibility form (was missing before V8.5 — only the 5 sub-flags existed)
5. ✅ Tests: anon viewer (off → 404, on with no flags → header only, on with proposal seeded → proposal card visible), authed member (banner visible + click navigates into workspace). API integration tests (`apps/api/tests/explore.test.ts`) cover the visibility filter logic, agreement `project_uri` leak regression, the campaign status filter, and the `anonDiscoverable` plumbing. **Note**: the "authed non-member" e2e case from the original task list is structurally impossible to set up in single-instance e2e — every user registered via `/api/v1/auth/register` is auto-joined to the instance's cooperative (`auth-service.ts:127-186`). The non-member scenario maps to a multi-instance federation case, which the e2e suite doesn't exercise. The principle is verified by inspection of the page server's `isMember` check and by the API tests.
6. ✅ `anonDiscoverable=false` → 404 for anon (and authed non-members)

**Design deviation from task 5** ("member sees full data"): the public profile page stays uniform for every viewer. When the viewer is authed AND an active member of the co-op, the page renders a "View as member →" banner linking to `/coop/[handle]` (the existing authed workspace, which already shows full data). This avoids duplicating the full-data render path and keeps the public profile coherent across all viewers. The "member sees full data" guarantee is preserved by the link destination, not by inline expansion.

**Public-safe status filter convention** (locked in for V8.5):
- `proposal.status IN ('open','closed','resolved') AND invalidated_at IS NULL`
- `agreement.status IN ('active','amended','terminated')`
- `funding_campaign.status NOT IN ('draft','cancelled')`

These are intentionally narrow positive lists. Closed-governance coops route proposals into `private_record` (Tier 2) via `VisibilityRouter`, so they never appear in the `proposal` table — no extra `governance_visibility` check is needed in `listPublicProposals`. Agreements & campaigns do not flow through `VisibilityRouter`; coop admins must opt them in via the per-section `publicAgreements`/`publicCampaigns` flags.

**Files** (final):
- `apps/web/src/routes/(public)/explore/[handle]/+page.svelte` — header + member banner + 4 sections (networks, proposals, agreements, campaigns)
- `apps/web/src/routes/(public)/explore/[handle]/+page.server.ts` — fetches profile + viewer membership (cookie-forwarded, gated on `locals.user`)
- `apps/web/src/routes/(public)/explore/+page.svelte` — directory listing null-memberCount render bug fixed (same root cause)
- `apps/api/src/routes/explore.ts` — `[handle]` handler extended with proposals/agreements/campaigns + the two missing visibility flag SELECTs
- `apps/api/src/services/{proposal,agreement,funding}-service.ts` — `listPublic*` helpers
- `apps/api/src/services/entity-service.ts` — `anon_discoverable` plumbed through `getCooperative`/`getCooperativeByHandle`/`updateCooperative`
- `apps/api/src/routes/org/cooperatives.ts` — `formatCooperative`, by-handle response, and PUT body all carry `anonDiscoverable`
- `apps/web/src/routes/(authed)/coop/[handle]/settings/{+page.svelte,+page.server.ts}` — master `anonDiscoverable` toggle wired through
- `apps/web/src/lib/api/{types,client}.ts` — `PublicProposalSummary` / `PublicAgreementSummary` / `PublicCampaignSummary` types, extended `ExploreCooperativeDetail`, `anonDiscoverable` on `CoopEntity` and the `updateCooperative` body, `memberCount: number | null` corrected
- `packages/common/src/validation.ts` — `UpdateCoopSchema` accepts `anonDiscoverable`
- `apps/web/tests/e2e/coop-public-profile.spec.ts` (new) — six describe blocks for the four viewer states + 404 edge case + settings round-trip
- `apps/web/tests/e2e/helpers.ts` — `setExploreVisibility`, `createOpenProposal` helpers
- `apps/api/tests/explore.test.ts` — V8.5 sections covering proposals/agreements/campaigns gating, the agreement `project_uri` regression test, and `anonDiscoverable` plumbing

### Phase V8.6 — Search Service (Co-ops + Posts) — ✅ Shipped

**Goal**: Postgres FTS over coop profiles and posts. Search UI in `/explore` and `/me/explore`.

**Tasks** (all complete):
1. ✅ Generated `tsvector` columns + GIN indexes via migration **059** (the spec said 060 — was off by one; latest pre-V8.6 migration was 058_profile.ts).
2. ✅ `SearchService` with `searchCooperatives()` (anon-safe) and `searchPosts()` (authed, scoped via `thread_member`).
3. ✅ Visibility integration: cooperative search filters on `cooperative_profile.anon_discoverable=true`; post search joins on `thread_member.entity_did = viewerDid` (NOT `membership` — matches the existing read-access model so officer-only `'direct'` threads don't leak post bodies to regular coop members).
4. ✅ `GET /api/v1/search/cooperatives` (anon) and `GET /api/v1/search/posts` (`requireAuth`).
5. ✅ Search UI: input + results on `/explore`, plus full `/me/explore` page with All / Cooperatives / Posts filter chips.
6. ✅ Wired into both `/explore` (anon, search via `?q=`) and `/me/explore` (authed, with chip filters).
7. ✅ 18 API integration tests + 9 e2e tests, including a thread-member ACL regression test (locks in that a coop member who is NOT a thread_member of a `'direct'` thread cannot search its post bodies).

**Design notes**:
- **Post search is authed-only**, scoped via `thread_member` (NOT cooperative `membership`). The naive coop-membership scope would leak officer-only direct-thread post bodies.
- **Status filter is `status != 'deleted'`**, NOT `status = 'active'`. The post status enum is `('active','edited','deleted')` per migration 006_posts.ts. The `'edited'` status is currently dead code (PostService.updatePost doesn't set it), but the filter is written to handle it correctly when V8.x adds an edit flow.
- **v1 ranks by recency only** (`ORDER BY created_at DESC, id DESC`). `setweight()` is in the migration so a future `ts_rank_cd`-based ordering can prefer name/handle matches over description matches without another schema change.
- **Snippet highlighting deferred**: v1 returns plain `body` field; the frontend computes a `body.slice(0, 200)` excerpt. `ts_headline` + HTML sanitization is a follow-up.
- **`anonDiscoverable` master switch is the only opt-in path** — coops opt their public profile in via the V8.5 settings toggle, and search inherits that.
- **Authed user with no active membership**: `requireAuth` middleware enforces an active membership, so `/api/v1/search/posts` returns 401 for newly-registered users between accepting an invitation and being approved. The `/me/explore` page server catches this and renders a "Post search requires an active cooperative membership" notice instead of failing the entire page load.
- **Cross-workspace post search**: A user in coops A and B will see posts from BOTH coops' threads (where they're a `thread_member`) when searching, regardless of which coop is their currently selected workspace. This is the correct behavior for `/me/explore` (a personal home view).

**Production runbook**: the 059 migration takes `ACCESS EXCLUSIVE` on the central `entity` table during the `ALTER TABLE ... ADD COLUMN GENERATED ALWAYS AS ... STORED` rewrite. **Not safe to run online against a populated production DB without a maintenance window.** See `docs/operations.md`.

**Files** (final):
- `packages/db/src/migrations/059_search_indexes.ts` — generated tsvector columns + GIN indexes
- `apps/api/src/services/search-service.ts` — `searchCooperatives` + `searchPosts`
- `apps/api/src/routes/search.ts` — two endpoints, `requireAuth` only on the posts route
- `apps/api/src/container.ts` — register `SearchService`
- `apps/api/src/index.ts` — mount `createSearchRoutes` after `createExploreRoutes`
- `apps/api/tests/helpers/test-app.ts` — also mount in test container
- `apps/api/tests/search.test.ts` — 18 integration tests
- `apps/web/src/lib/api/types.ts` — `SearchPostResult` / `SearchCooperativesResponse` / `SearchPostsResponse`
- `apps/web/src/lib/api/client.ts` — `searchCooperatives` / `searchPosts` client methods
- `apps/web/src/routes/(public)/explore/+page.{server.ts,svelte}` — search input + branching load
- `apps/web/src/routes/(authed)/me/explore/+page.{server.ts,svelte}` — new page with chips, posts-unavailable graceful degradation
- `apps/web/src/lib/components/layout/sidebar-nav.ts` — add `Explore` entry to `homeNavSection` items
- `apps/web/tests/e2e/search.spec.ts` — 9 e2e tests
- `docs/operations.md` — migration runbook entry

### Phase V8.7 — Match Service & Matches UI

**Goal**: Background matchmaking. Matches table. Matches page on Home and `/me/matches`.

**Tasks**:
1. Add `match_suggestion` table (migration 061)
2. Implement `MatchmakingService` with scoring functions
3. Background job: hourly scan, generate top N matches per user
4. Implement match endpoints (`GET /api/v1/me/matches`, dismiss, act)
5. Build SuggestedMatches widget on Home (replace placeholder from V8.2)
6. Build `/me/matches` full page
7. Match notifications via existing notification system
8. Tests: scoring produces sensible results, dismiss/act state machine

**Files**:
- `packages/db/src/migrations/061_match_suggestion.ts` (new)
- `apps/api/src/services/matchmaking-service.ts` (new)
- `apps/api/src/jobs/matchmaking-job.ts` (new)
- `apps/api/src/routes/me-matches.ts` (new)
- `apps/web/src/routes/(authed)/me/matches/+page.svelte` (new)
- `apps/web/src/lib/components/home/widgets/SuggestedMatches.svelte` (real impl)

### Phase V8.8 — People Search & Alignment Matchmaking — ✅ Shipped

**Goal**: Extend search to people. Match scoring uses alignment data as the primary signal. Person matches flow through the same `match_suggestion` table, background job, routes, and Home/matches UI that V8.7 established — V8.7 was deliberately designed so V8.8 would not change the table schema, routes, job loop, or widget contracts.

**Tasks** (all complete):
1. ✅ Migration **061** — `profile.discoverable` opt-in flag, `profile.profile_bio_tsv` + GIN, `idx_profile_discoverable` partial index, `desired_outcome.outcome_search_tsv` + GIN. (The doc originally said 062; the repo's convention is contiguous numbering — the latest pre-V8.8 migration was 060. The migration header documents the rename.)
2. ✅ `SearchService.searchPeople()` with the **D1 hybrid** discoverability predicate: `profile.discoverable = true OR EXISTS (stakeholder_interest for entity_did)`. The viewer can see themselves; all other results are gated. Sorted by recency with cursor pagination.
3. ✅ `SearchService.searchAlignment()` via two CTEs (outcome FTS + interest tag match) with UNION, viewer membership exclusion (the viewer never sees coops they're already an active member of), and a belt-and-braces `cooperative_profile.anon_discoverable` filter on the outer join so the alignment endpoint respects the same opt-in switch as plain coop search.
4. ✅ `score.ts` rewritten — `SCORING_VERSION = 2`, weighted-Jaccard alignment over mean-priority-weighted interest categories, with a **three-branch fallback** (see Design notes below). Discriminated `CandidateRow` union (cooperative vs person) so the composition branches stay type-safe.
5. ✅ `MatchmakingService` now fetches person candidates alongside cooperative candidates via `match_type = 'person'` — gated by the same D1 hybrid discoverability rule searchPeople uses. Interest aggregation helpers and the tombstone subquery were extracted as shared internal helpers (DRY pass in commit `199350b`).
6. ✅ `MatchView` contract evolved to support both types. `cooperativeType` relaxed to nullable, new `matchType: 'cooperative' | 'person'` discriminant, new `sharedInterestCount` + `sharedCoopCount` fields (populated for person matches, `null` for cooperatives). The web client, Home widget, and `/me/matches` page render a conditional `User` vs `Building2` icon and conditional subtitle based on `matchType`.
7. ✅ `profile.discoverable` user-facing toggle: `ProfileService.setDiscoverable`, `PATCH /api/v1/me/profile` (new route file `me-profile.ts`), and a Discovery toggle on `/me/settings`. The `me-profile` GET response is **nested-only** (`{ profile: {…} }`) — the redundant flat-field convenience shape was dropped in commit `ef15e9e` before anything depended on it.
8. ✅ People filter chip on `/me/explore` — fourth chip alongside All / Cooperatives / Posts. The page server fetches people alongside posts under the "All" chip so results are visible without requiring the user to select the People filter first.
9. ✅ 51 net new API tests (20 in `score.test.ts` (new file), 20 in `search.test.ts` for people+alignment, 5 added to `profile-service.test.ts` for `setDiscoverable`, net +6 in `me-matches.test.ts` — 9 person-match cases added, 3 pure-scoring cases removed and relocated to `score.test.ts`). Includes three load-bearing privacy regression tests that lock in the D1 hybrid predicate and the viewer-membership exclusion. Two new E2E tests (People chip round-trip on `/me/explore`, person match render on `/me/matches`) via a new `seedCandidatePerson` helper promoted to the shared E2E helpers module in the final fix-up commit.

**Design notes** (V8.8):

- **Score composition — three branches**. The `score.ts` rewrite uses weighted Jaccard over mean-priority-weighted interest categories, but the *composition* with recency/diversity has three branches that together preserve the "brand new user gets non-empty matches" guarantee without polluting the scored pool for established users:
  1. `alignment > 0` — composition: `0.6·alignment + 0.3·recency + 0.1·diversity` for coops, `0.7·alignment + 0.3·recency` for persons. Alignment dominates.
  2. `alignment == 0` AND the user has **no** alignment data — fall back to the V8.7 formula `recency × diversity` so the widget isn't empty for newly-registered users.
  3. `alignment == 0` AND the user **has** alignment data — `score = 0` (suppression). Any candidate with non-zero alignment outranks this row. The service layer decides whether to fill remaining top-N slots from the zero-scored pool; by default it does, ensuring widget stability during the transition.
  This asymmetry is deliberate: a new user with no signal deserves *any* suggestion; a user who took the trouble to record alignment data expects their matches to reflect it.

- **v1 → v2 reason shape transition**. Pre-V8.8 `match_suggestion` rows written with `SCORING_VERSION = 1` have `signals: { recency, diversity, ageDays }` only. V8.8 extends the shape to six fields (`alignment`, `recency`, `diversity`, `ageDays`, `sharedCategoryCount`, `sharedCoopCount`) and the web mapper uses `?? 0` fallbacks so existing v1 rows render without crashing. For a clean dev/test slate, `TRUNCATE match_suggestion` is safe — the next hourly tick repopulates. The 14-day pruner from V8.7 eventually clears v1 rows without any intervention.

- **Dead GIN index not added**. The draft of Task 1 included a `jsonb_path_ops` GIN on `stakeholder_interest.interests` for alignment interest aggregation. It was dropped during the Task 5 fix-up (commit `8ce43d9`) because the actual query shape is `jsonb_array_elements(si.interests) + text equality`, which expands rows and compares text — it can't use a `jsonb_path_ops` index (those only accelerate containment operators like `@>`). The index would sit unused while adding write-time overhead. Sequential scan is acceptable at V8.8 scale; revisit (e.g., via a denormalized pre-lowered category column) if `stakeholder_interest` grows past ~100K rows. The migration header documents this rationale.

- **`searchAlignment` excludes the viewer's own coops**. The matchmaker should never suggest "join this coop you are already an active member of". This filter was also added in commit `8ce43d9` after the first implementation round missed it.

- **`/search/people` requires active membership**. The route uses `requireAuth` (mirroring V8.6's `searchPosts`), not just `optionalAuth`. A newly-registered user with no active membership gets 401; the `/me/explore` page server catches this and degrades gracefully. This is consistent with V8.6 and intentionally conservative — V8.X may relax it behind its own anti-scraper rate limits.

**Out of scope for V8.8** (deferred):
- **Public profile pages for persons** (`/profiles/[handle]`) — V8.9. Person match cards currently render `displayName` as plain text (no link) pending this work.
- **`profile.public_bio` privacy flag** — separate concern; V8.8 ships a binary opt-in.
- **Person-to-person friend graph / mutual connections signal** — V8.X; not in the V8.8 scoring input.
- **Anti-scraper rate limits on `/search/people`** — V8.X; `requireAuth` is the only gate for now.
- **Embeddings for alignment matching** — Jaccard baseline is sufficient for V8.8 scale; LLM embeddings revisit once we have real usage data.
- **Match notifications** — V8.7 deferred these because `notification.cooperative_did` is `NOT NULL` and system-generated matches have no natural sender. V8.8 inherits the constraint unchanged.

**Files** (final):
- `packages/db/src/migrations/061_people_search.ts` (new) — `profile.discoverable` + `profile_bio_tsv` + partial index, `desired_outcome.outcome_search_tsv`, all with rationale in the header
- `packages/db/src/schema.ts` — `profile.discoverable` added to `ProfileTable`; tsvector columns intentionally NOT typed (like V8.6, they're never SELECTed, only used in raw `sql\`\`` WHERE clauses)
- `apps/api/src/services/matchmaking/score.ts` — rewritten, `SCORING_VERSION = 2`, discriminated `CandidateRow` union, three-branch composition
- `apps/api/src/services/matchmaking/score.test.ts` (new) — 20 unit tests covering all three branches and Jaccard edge cases
- `apps/api/src/services/matchmaking-service.ts` — person candidate path, shared interest/tombstone helper extraction, `match_type` propagation through DELETE+INSERT refresh
- `apps/api/src/services/search-service.ts` — `searchPeople` + `searchAlignment` (additions; V8.6 `searchCooperatives` + `searchPosts` unchanged)
- `apps/api/src/services/profile-service.ts` — `setDiscoverable(entityDid, discoverable)` method
- `apps/api/src/routes/search.ts` — `GET /api/v1/search/people` (`requireAuth`) + `GET /api/v1/search/alignment` (`requireAuth`)
- `apps/api/src/routes/me-profile.ts` (new) — `GET /api/v1/me/profile` (nested shape) + `PATCH /api/v1/me/profile` body `{ discoverable: boolean }`
- `apps/api/src/routes/admin.ts` — `test-seed-candidate-person` endpoint (non-prod only, mirrors V8.7's `test-seed-candidate-coop`)
- `apps/api/src/index.ts` — mount `createMeProfileRoutes`
- `apps/api/tests/search.test.ts` — +20 tests: 11 people-search + 9 alignment-search, including three privacy regression tests
- `apps/api/tests/me-matches.test.ts` — +6 tests for person match rendering in the list endpoint
- `apps/api/tests/profile-service.test.ts` (new) — 11 tests for setDiscoverable + PATCH roundtrip
- `apps/web/src/lib/api/types.ts` — `MatchSuggestion` evolved (`cooperativeType` nullable, new `matchType` discriminant, `sharedInterestCount` + `sharedCoopCount`), `MatchReason.signals` extended to six fields, new `SearchPersonResult` / `SearchPeopleResponse` / `SearchAlignmentResponse` types
- `apps/web/src/lib/api/client.ts` — `searchPeople`, `searchAlignment`, `getMyProfile`, `setMyDiscoverable`
- `apps/web/src/lib/components/home/SuggestedMatches.svelte` — conditional `User` vs `Building2` icon and conditional subtitle on `matchType`
- `apps/web/src/routes/(authed)/me/matches/+page.svelte` — same conditional rendering for the full-page list
- `apps/web/src/routes/(authed)/me/explore/{+page.server.ts,+page.svelte}` — People filter chip, 401-graceful loader that degrades when the user has no active membership
- `apps/web/src/routes/(authed)/me/settings/{+page.server.ts,+page.svelte}` — Discovery toggle bound to `/me/profile` PATCH
- `apps/web/tests/e2e/search.spec.ts` — +1 test: People chip round-trip
- `apps/web/tests/e2e/matches.spec.ts` — +1 test: seeded discoverable person renders as a match card
- `apps/web/tests/e2e/helpers.ts` — `seedCandidatePerson` helper promoted from an in-spec local in the final fix-up commit `9797fcc`

### Phase V8.9 — Polish & Onboarding — ✅ Shipped

**Goal**: Contextual "Get Started" card on Home for new users. Public person profile pages (deferred from V8.8). Content review. Accessibility audit.

**Tasks** (all complete):
1. ✅ Migration 062 adds `dismissed_get_started` boolean to `profile` table (O(1) catalog-only)
2. ✅ GetStartedCard component on Home, rendered until dismissed via API-persisted flag
3. ✅ Card content: welcome message, links to Explore, suggest creating/joining a coop
4. ✅ Marketing landing page: feature bullets (governance, agreements, discovery, open protocols)
5. ✅ About page: added People discovery and alignment matchmaking paragraph
6. ✅ Accessibility: skip-to-main link, focus trap for modals, ARIA on SuggestedMatches/GetStartedCard/error messages
7. ✅ Empty state polish: Home cooperatives section with explore CTA
8. ✅ Tests: 19 new tests — 8 API (me-profile route + profile-service), 5 API (person explore), 4 E2E (GetStartedCard), 3 E2E (person profile), 1 E2E (People chip assertion)

**V8.8 deferred items resolved in V8.9:**
- ✅ **Public person profile pages** (`/profiles/[handle]`) — read-only page showing displayName, bio, discoverable cooperatives, and alignment interest categories. D1 hybrid predicate enforced server-side. Match cards and explore results now link to profiles (V8.8 TODOs removed).
- ✅ **Settings discoverability toggle error recovery** — PATCH error response now includes the pre-mutation `discoverable` value so the checkbox reverts. Error `<p>` has `role="alert"`.
- ✅ **Explore page E2E chip enumeration** — `People` tab assertion added to `search.spec.ts`.
- ✅ **Migration 061 runbook deadlink** — entry added to `docs/operations.md` maintenance window table.

**Files** (final):
- `packages/db/src/migrations/062_dismissed_get_started.ts` (new) — `profile.dismissed_get_started BOOLEAN NOT NULL DEFAULT false`
- `packages/db/src/schema.ts` — `dismissed_get_started` added to `ProfileTable`
- `apps/api/src/services/profile-service.ts` — `setDismissedGetStarted`, `getPublicPersonProfile`, `DefaultProfile.dismissedGetStarted`
- `apps/api/src/routes/me-profile.ts` — PATCH widened to accept `{ discoverable?, dismissedGetStarted? }`; GET returns `dismissedGetStarted`
- `apps/api/src/routes/explore-person.ts` (new) — `GET /api/v1/explore/people/:handle` (public, D1 hybrid gated)
- `apps/api/src/index.ts` — mounted `createExplorePersonRoutes`
- `apps/web/src/lib/components/home/GetStartedCard.svelte` (new) — onboarding card with dismiss form action
- `apps/web/src/routes/(authed)/me/+page.server.ts` — loads `dismissedGetStarted` from profile; `dismissGetStarted` action
- `apps/web/src/routes/(authed)/me/+page.svelte` — renders GetStartedCard when not dismissed; polished empty state
- `apps/web/src/routes/(public)/profiles/[handle]/+page.svelte` (new) — public person profile page
- `apps/web/src/routes/(public)/profiles/[handle]/+page.server.ts` (new) — loads person profile, 404 on miss
- `apps/web/src/lib/components/home/SuggestedMatches.svelte` — person matches link to `/profiles/{handle}`; `aria-label` on section
- `apps/web/src/routes/(authed)/me/matches/+page.svelte` — person matches get "View" link to `/profiles/{handle}`
- `apps/web/src/routes/(authed)/me/explore/+page.svelte` — people results link to profiles
- `apps/web/src/routes/(authed)/me/settings/+page.server.ts` — error response includes pre-mutation `discoverable`
- `apps/web/src/routes/(authed)/me/settings/+page.svelte` — `role="alert"` on error message
- `apps/web/src/routes/+page.svelte` — feature bullets grid below hero
- `apps/web/src/routes/(public)/about/+page.svelte` — people discovery paragraph
- `apps/web/src/lib/actions/focus-trap.ts` (new) — reusable Svelte action for modal focus trapping
- `apps/web/src/app.html` — skip-to-main-content link
- `apps/web/src/lib/components/layout/AppShell.svelte` — `id="main-content"` on `<main>`
- `apps/web/src/routes/(public)/+layout.svelte` — `id="main-content"` on `<main>`
- `apps/web/src/lib/components/ui/Modal.svelte` — `use:focusTrap` applied
- `apps/web/src/lib/api/types.ts` — `MeProfilePayload.dismissedGetStarted`, `ExplorePersonProfile`
- `apps/web/src/lib/api/client.ts` — `dismissGetStarted()`, `getExplorePerson(handle)`
- `docs/operations.md` — migration 061 maintenance window entry
- Tests: `profile-service.test.ts` (+3), `me-profile.test.ts` (new, 8), `explore.test.ts` (+5), `home.spec.ts` (+4), `person-profile.spec.ts` (new, 3), `search.spec.ts` (+1), `matches.spec.ts` (updated V8.8 assertion)

**Still deferred to V8.X** (not V8.9 scope):
- **Anti-scraper rate limits on `/search/people`** — `requireAuth` is the only gate; needs rate-limit middleware design before public promotion
- **Match notifications** — blocked by `notification.cooperative_did NOT NULL`; requires nullability migration
- **Pre-lowered category column on `stakeholder_interest`** — scale optimization for ~100K+ rows
- **Ambient test pollution** (`well-known.test.ts` / `appview-dispatch.test.ts`) — pre-existing, needs separate investigation

### Phase V8.10 — Entity Editing Foundation + Core Entities

**Goal**: Establish the entity editing pattern and apply it to the 5 most user-facing entities. Addresses a long-standing gap where users could create entities but not edit them — 13 of 16 entities currently have no edit UI.

**Reference patterns already in the codebase**: Cooperative Profile (`/coop/[handle]/settings/+page.svelte`) and Legal Document (`/coop/[handle]/legal/[id]/+page.svelte`) both demonstrate inline edit-toggle patterns. Alignment Interests uses upsert semantics (create and edit via the same endpoint). V8.10 formalizes these into two consistent patterns:

**Pattern 1 — Modal Reuse** (for entities created via modals):

```typescript
// The existing create modal gains an `existing` prop. When null, it's create mode.
// When an entity is provided, fields are pre-filled and form submits to ?/update.
interface Props {
  open: boolean;
  existing?: EntityType | null;  // null = create, object = edit
  onclose: () => void;
}

// In the page component, clicking an Edit button on a row sets:
let editingEntity = $state<EntityType | null>(null);
let modalOpen = $state(false);

function openEdit(entity: EntityType) {
  editingEntity = entity;
  modalOpen = true;
}
function openCreate() {
  editingEntity = null;
  modalOpen = true;
}

// Modal form action is derived from the mode:
const action = $derived(editingEntity ? '?/update' : '?/create');
```

**Pattern 2 — Form Page Reuse** (for entities with dedicated form pages):

```
apps/web/src/routes/(authed)/coop/[handle]/governance/
  new/+page.svelte            # existing — create form
  [id]/+page.svelte           # existing — detail/read-only view
  [id]/edit/+page.svelte      # NEW — edit form, renders shared form component
```

Extract the form fields into a shared `<ProposalForm>` component that both `new/+page.svelte` and `[id]/edit/+page.svelte` render. The shared component accepts an optional `initialValues` prop.

**State-machine gating**: Each entity defines a `canEdit(entity, user)` helper that returns true only when:
- Entity's status is in an editable state (e.g., `draft` for proposals)
- User has permission (creator, admin, owner — entity-specific rules)
- Other entity-specific conditions (e.g., no signatures yet for agreements)

The Edit button is conditionally rendered based on this helper. Backend also enforces the same check on the update endpoint to prevent direct API bypass.

**Entities covered in V8.10**:

1. **Proposal** — Editable only in `draft` state. Once `open`, locked (voting may have started). Form-page reuse.
2. **Agreement** — Editable only in `draft` state. Once `open` (awaiting signatures) or `active`, locked — editing an active agreement would invalidate signatures. Form-page reuse.
3. **Campaign** — Editable in `draft` and `active` states (description, goal, dates). Locked once `funded`, `completed`, or `cancelled`. Form-page reuse.
4. **Task** — Editable in `backlog`, `todo`, `in_progress`, `in_review` (not `done`). Modal reuse.
5. **Expense** — Editable only in `submitted` state (before review). Locked once `approved`, `rejected`, or `reimbursed`. Modal reuse.

**Key files**:
- `apps/web/src/lib/components/forms/ProposalForm.svelte` (new shared form component)
- `apps/web/src/lib/components/forms/AgreementForm.svelte` (new)
- `apps/web/src/lib/components/forms/CampaignForm.svelte` (new)
- `apps/web/src/routes/(authed)/coop/[handle]/governance/[id]/edit/+page.svelte` (new)
- `apps/web/src/routes/(authed)/coop/[handle]/governance/[id]/edit/+page.server.ts` (new)
- `apps/web/src/routes/(authed)/coop/[handle]/governance/new/+page.svelte` (refactor to use shared form)
- Similar file triplet for Agreement and Campaign
- `apps/web/src/routes/(authed)/coop/[handle]/tasks/+page.svelte` (extend task modal)
- `apps/web/src/routes/(authed)/coop/[handle]/expenses/+page.svelte` (extend expense modal)
- `apps/web/src/lib/utils/entity-permissions.ts` (new — `canEdit` helpers)

**Out of scope for V8.10**: Status transitions (already implemented), entity deletion (separate concern — see Future Work), auto-save / draft management.

### Phase V8.11 — Entity Editing Extended

**Goal**: Apply the V8.10 patterns to the remaining 8 entities that need edit support.

**Entities covered**:

1. **Officer** — Edit title, term dates, responsibilities. Only editable while status is `active`. Modal reuse.
2. **Compliance Item** — Edit title, description, due date. Only editable while `open`. Modal reuse.
3. **Member Notice** — Edit before `sent_at` is set (i.e., drafts). Locked once sent. Modal reuse. **Note**: Currently no update API for notices — V8.11 adds `PUT /api/v1/admin/notices/[id]`.
4. **Fiscal Period** — Edit label, start/end dates only while `open`. Modal reuse.
5. **Commerce Listing** — Edit title, description, category, availability while `active` or `paused`. Locked once `closed`. Modal reuse.
6. **Commerce Need** — Edit title, description, urgency, category while `active`. Modal reuse.
7. **Alignment Outcomes** — Edit title, description, success criteria while status is `proposed` or `endorsed`. Locked once `active`, `achieved`, or `abandoned`. Form-page or modal reuse depending on existing UI.
8. **Member role editing** — Add a role-editing UI to the members table. Admin-only. Uses the existing `updateMemberRoles` API. Modal-based role picker.

**New API endpoint required**: `PUT /api/v1/admin/notices/[id]` (plus matching service method and `updateNotice` client method) — all other entities already have update endpoints that just need UI wiring.

**Key files**:
- New `EditForm` integrations in each admin modal (officer, compliance, notice, fiscal period)
- New modals or row-level edit buttons for commerce listings/needs
- `apps/api/src/services/member-notice-service.ts` (add update method)
- `apps/api/src/routes/admin/notices.ts` (add PUT endpoint)
- `apps/web/src/lib/api/client.ts` (add `updateNotice`)
- Member row role-picker UI in `members/+page.svelte`

**Out of scope for V8.11**: Entity deletion (see Future Work), activity/audit log integration beyond the existing fact log.

---

## 8. Future Work (Captured but Not Built in V8)

### Profile system
- Profile creation UI (V8.X)
- Multi-profile switcher in sidebar/header
- Per-profile widget configurations (data model already supports)
- Verification mechanism for default profile (KYC, web-of-trust, social attestation)
- Per-profile reputation scores
- Per-profile content visibility filters
- Per-coop profile policies (e.g., "this coop requires default-profile display")
- Profile-specific membership filtering
- Cross-profile activity aggregation on Home
- True multi-DID alts (deliberately NOT supported in V8 — DIDs are canonical)

### Widget system
- Widget registry for dynamic widget types
- Widget marketplace: cooperatives can publish widget definitions for their members
- Drag-and-drop customization UI
- Widget settings panels
- Lexicon picker UI for browsing all registered lexicons
- Per-widget filters (collection, time range, author, tags)
- Public coop widgets vs private coop widgets — surfaced automatically based on membership
- External lexicon widgets (Bluesky, Tangled, WhiteWind, Smoke Signal)

### Home extensions
- Spatial Home (XR/VR 3D environment)
- Avatar-based co-presence
- Visiting (other users invited to your Home)
- Doors (each coop is a portal from Home into the coop's spatial workspace)
- Configurable invitation lists, guest permissions, "open for visitors" status
- WebRTC video co-presence inside Home
- Hosting tools (room layouts, persistent objects, shared widgets)
- Stream feeds (StreamPlace integration for live video on Home)

### Discovery & matchmaking
- AI-backed feed ranking (replaces chronological)
- Cross-protocol search (Bluesky, Tangled, WhiteWind, ActivityPub federation)
- Match feedback loop (reinforcement learning from dismiss/act signals)
- Geographic clustering for location-based matches
- Skill graph (extracted from member-class assignments + bio)
- Need-to-skill matching (coops post needs, system suggests skilled members)
- Mutual-friend matching
- Time-decay tuning per match type

### Visibility model
- Field-level visibility flags (e.g., "show member emails to officers only")
- Per-tab visibility (e.g., "agreements visible to anon, but not legal")
- Per-relationship visibility ("this coop is visible to these specific other coops")
- Time-bounded visibility (proposals public after they're closed)
- Per-record visibility overrides
- Inter-coop sharing agreements (formalized as records)

### Public web
- Marketing site enhancements (testimonials, case studies, demo coops)
- Multilingual content (i18n)
- SEO optimization for public coop pages
- Open Graph meta tags for sharing
- Public RSS/Atom feeds for coops with `publicActivity`
- Public ATProto firehose subscription for coops (so other AppViews can index coopsource content)

### Entity editing (beyond V8.10/V8.11)
- **Entity deletion** — V8.10/V8.11 handle editing only. Soft-delete or hard-delete for user-created entities (proposals, tasks, expenses, etc.) is a separate concern. Deletion policy varies by entity (e.g., drafts deletable, active records not; some entities should tombstone rather than disappear). Deferred to post-V8.
- **Auto-save / draft management** — currently all forms are explicit-submit; no draft persistence. Post-V8 could add client-side auto-save with an explicit "Save draft" affordance.
- **Edit history / revisions** — Legal Document has versioning; other entities don't. A generic edit-history timeline (leveraging the existing fact log) is a post-V8 feature.
- **Bulk editing** — editing multiple entities at once (e.g., tag multiple tasks). Not planned for V8.
- **Collaborative editing** — multiple users editing the same entity simultaneously with conflict resolution. Far post-V8.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Scope creep — V8 is large | Phased delivery; each phase is independently shippable |
| Visibility model audit is tedious | Centralize via `applyVisibility()` helper; one place to enforce, rather than per-endpoint custom logic |
| Profile rename rate-limiting could be circumvented | Server-side check using `last_renamed_at`; rate limit on the API endpoint |
| Multi-profile UX is confusing if users see only one profile in V8 | V8 ships with default-only; multi-profile UI deferred until users see real value |
| Search index drift (records added but FTS not updated) | Use Postgres `STORED` generated columns; auto-updated on insert/update |
| Matchmaking job runs during peak load | Schedule for off-hours; rate limit batch size |
| Anonymous endpoint abuse (DDOS) | Existing rate limiting; cache aggressively |
| Public coop page leaks internal data | Visibility helper enforcement; integration tests with anon, authed, member, officer test users |
| Workspace switcher dropdown gets cluttered with many coops | Search/filter inside dropdown when > 10 coops |
| Home customization feels useless until V8.X | Hardcoded set of 4-6 widgets is enough to demonstrate value; users see content immediately |
| Mode 2 vs Mode 3 confusion (which workspace am I in?) | Workspace switcher header always shows current workspace name; sidebar items differ visibly |
| Backwards compatibility with V7 sidebar redesign | V8.2 builds on V7 sidebar; existing users transition seamlessly |
| Profile data model changes affect existing membership/voting code | Profile is presentation layer only; underlying DID semantics unchanged |
| Marketing landing page content unclear | Content review in V8.9; keep landing page simple and focused on cooperatives |

---

## 10. Success Criteria

V8 is successful when:

- [x] Anonymous users can land on a marketing page and learn what Co-op Source is
- [x] Anonymous users can browse a directory of public cooperatives
- [x] Anonymous users can view individual public coop profile pages
- [x] Logged-in users land on Home (not the old dashboard)
- [x] Home displays a customizable layout with at least 4 hardcoded widgets
- [x] Workspace switcher in the sidebar header allows seamless navigation between Home and any coop
- [x] Visibility model is enforced consistently across all API endpoints
- [x] Search returns relevant cooperatives for both anon and authed users
- [x] Matchmaking service surfaces relevant matches on Home and `/me/matches`
- [x] Profile data model supports multi-profile (even though UI shows only one profile)
- [x] Existing V7 sidebar (Cooperative / Network / You) continues to work for in-coop navigation
- [x] No regressions in existing cooperative workflows (governance, agreements, finance, admin)
- [x] No leaked private data in public-facing API endpoints (verified by integration tests)
- [ ] **(V8.10)** Proposal, Agreement, Campaign edit UIs working, gated by state machine
- [ ] **(V8.10)** Task and Expense edit UIs working via modal reuse
- [ ] **(V8.10)** `canEdit(entity, user)` helper pattern documented and used consistently
- [ ] **(V8.10)** No regressions to existing create flows; integration tests for at least one entity's edit state-gating behavior
- [ ] **(V8.11)** All 13 originally-missing editing UIs implemented
- [ ] **(V8.11)** New `updateNotice` API endpoint added (the only missing backend endpoint)
- [ ] **(V8.11)** Member role editing UI in members table
- [ ] **(V8.11)** Consistent pattern across all entities (modal reuse OR form-page reuse — no ad-hoc solutions)

---

## 11. References

- ARCHITECTURE-V7.md — Production deployment + extensibility (hook pipeline, declarative configs, scripting, MCP)
- ARCHITECTURE-V6.md — ATProto federation (PDS, PLC, OAuth, AppView)
- ARCHITECTURE-V5.md — Cooperative lifecycle, security model, lexicon schemas
- Slack workspace switcher pattern
- Linear's home/team navigation
- Bluesky's identity model (DID-centric)
- ATProto federation guides — https://atproto.com/guides/

---

## Appendix: Glossary

| Term | Meaning |
|------|---------|
| **Home** | The user's customizable personal space; replaces the dashboard. Persists across sessions; future XR-extensible. |
| **Profile** | A presentation layer over a single canonical DID. Multi-profile lets one user have multiple personas. |
| **Default Profile** | The verified, real-name profile. Rate-limited renames. One per user. |
| **Persona Profile** | A non-default profile representing a different facet of the user (e.g., "web developer," "embedded systems"). |
| **Current Profile** | The profile the user has currently activated, used for outward display. |
| **Workspace** | A coop or Home — the contextual environment the user is currently navigating. |
| **Workspace Switcher** | The sidebar header dropdown that lets the user switch between Home and any coop. |
| **Visibility Tier** | One of: anonymous, authenticated, cross-coop, member, officer, owner. Controls data access. |
| **Lexicon-Driven Widget** | A widget defined by a lexicon (collection) + filter + layout. The user picks a lexicon and the widget renders matching records. |
| **Match Suggestion** | A scored recommendation generated by the matchmaking service (cooperative, person, content, or skill). |
| **Anon Discoverable** | A flag on a cooperative indicating it should appear in public directories and search. |
