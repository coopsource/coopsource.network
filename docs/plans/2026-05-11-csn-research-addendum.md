> **Status (2026-07-04): superseded; forecast graded.** Its §6.4 predictions were scored in `docs/plans/2026-07-04-atproto-shared-spaces-research.md` (7/9 right; `ats://` missed). Current state there; canonical spec `ARCHITECTURE-V12.md`.

# CSN V11 Research Addendum

**Window:** May 1, 2026 – May 11, 2026
**Compiled:** May 11, 2026
**Companion to:** `2026-05-08-csn-architectural-direction.md`
**Supersedes:** An earlier draft of this addendum that incorrectly flagged Diary 5 and HappyView v2.5.0 as unverifiable. Both exist; the earlier recommendation to purge those citations is rescinded.

---

## 0. Correction notice

The earlier draft of this addendum was wrong on three load-bearing claims:

1. **Diary 5 ("What's in a Name?", May 8, 2026) exists** at `https://dholms.leaflet.pub/3mlegohgtps2k`. It is the most architecturally substantive post in the series for V11.
2. **HappyView v2.x exists** and is fully documented at `happyview.dev`. The GitHub repo at `gamesgamesgamesgamesgames/happyview` is stale at v1.4.3 because **the project migrated its source of truth to Tangled** (`tangled.org/gamesgamesgamesgames.games/happyview`).
3. **The `bluesky-social/atproto` `permissioned-data` branch** is real — Diary 5 explicitly links to it as the sketch implementation.

Cause: a search-first research pattern that doesn't see content the search index hasn't yet crawled, combined with overstatement of search-miss as "doesn't exist." Direct URL fetches confirm all three.

A separate find — Meri's April 10, 2026 post (linked by Alan) — turned out to be the **provenance of the Arbiter pattern** and is the load-bearing piece this addendum centers on. See §2.

---

## 1. What Diary 5 commits to (load-bearing for V11)

Diary 5 reconstructs the design from the URI structure outward. The canonical URI is:

```
ats://did:example:space_did/com.example.space.type/space_key/did:example:author_did/com.example.collection/record_key
```

Six segments: **SpaceDID / SpaceType (NSID) / Skey / AuthorDID / Collection / Rkey**.

### 1.1 Decisions now settled (where they were open before Diary 5)

- **URI order is SPACE-first, then AUTHOR/record.** Diary 5 walks through this explicitly with philosophical, practical, intuitive, and aesthetic arguments. The space is the authority; the user's authority within the space is downstream of being included in the space's member list. V11's strawman should reflect this; the alternative (author-first, space-internal) is rejected. **Note (§2):** this decision is contested by Meri/Zicklag, who argued for the author-first order in April. Diary 5 is in part a response to that argument.

- **Spaces get their own DID whenever the space could change hands.** Personal-data spaces (bookmarks, mutes, private posts, newsletters, drafts) use the user's own DID. Anything social — including 1:1 DMs — gets a separate space DID. Quote: *"A space needs its own DID any time two or more people are sharing a space and there's a possible future where the space and the creator of the space are not the same entity."*

- **Controlled DIDs on the PDS are confirmed as needed, but scoped tightly.** Quote: *"This does imply that we'll need a lightweight 'controlled DID' system on the PDS so user accounts can manage (and transfer!) space DIDs. For expediency's sake, we want to keep that scoped as tightly as possible and resist the pull toward building a generic managed-account system."* Pushes back on V11 designs that assume a rich PDS-level managed-account API.

- **Space type is an NSID that resolves to a Lexicon document** — *"kinda like a 'collection' for spaces mixed with a permission-set Lexicon."* The OAuth consent screen is the load-bearing reason: it lets apps ask for access by modality (*"Do you want to give this app access to your AtmoBoards forums?"*) rather than by enumerated DIDs. Confirms V11's NSID-as-OAuth-consent-boundary commitment.

- **Spaces are not circles.** Diary 5 explicitly rejects the Google+ circles analogy. Spaces are particular containers tied to a particular modality, not reusable cross-modality ACLs.

### 1.2 Skey is more fundamental than the V11 brief may have treated it

The space key (`skey`) is a short arbitrary string — slug, TID, cryptographic identifier, or static string with special semantics like `"self"` — that lets **multiple spaces hang off a single DID**. Two normal cases:

1. **Personal spaces under the user's own DID** — bookmarks, mutes, private posts, drafts each get their own skey under the same user DID.
2. **Sub-spaces within a community DID** — members-only chat, moderator-only chat, sub-channel for a subset of members. All share the community DID; skey distinguishes them.

**Implication for V11.** A cooperative does not need a separate DID for each of: board, role-spaces, member classes, sub-committees, working groups, finance officers' channel. All of these can live as skey-distinguished spaces under the one cooperative DID, with different space-type NSIDs and different member lists. Significant simplification, and aligns with §12.1's deferred cost-optimization — skey is the principled cost-optimization path that doesn't require minting per-context DIDs.

### 1.3 URI scheme: still not decided

Diary 5 is explicit: *"You'll notice that the scheme is not at://. We're not sure about what the scheme should be (taking suggestions!), but we're pretty sure it's not at:// at least."* `ats://` is the leading candidate but not committed. The IETF ATP WG's URI work could constrain this.

**Implication for V11 §12.3.** What's load-bearing is the *semantic* distinction between permissioned and public URIs. The specific token `ats://` is not yet committed. V11's pivot policy should say "non-`at://` scheme, leading candidate `ats://`" rather than treating `ats://` as fixed.

### 1.4 Other Diary 5 signals

- **Diaries will slow** post-AtmosphereConf. Next post: access control or sync protocol. Quantum-resistant signatures may complicate sync.
- **URI golf rejected** — no relative URIs, no DID-collapsing when space DID equals author DID. Preserve string equality.
- **Sketch implementation branch is real**: `https://github.com/bluesky-social/atproto/compare/permissioned-data`. Holmgren says *"please don't over-index on it."*

---

## 2. The Arbiter pattern's provenance — Meri's April 10 post

**Source:** `https://meri.leaflet.pub/3mj4qwvypq22a` — *"Evaluating permissioned spaces for community contexts"*, April 10, 2026, co-credited to Meri and `@zicklag.dev` as the working pair on `@roomy.space`.

This post was published between Diary 4 (March 20) and Zicklag's standalone Arbiter post (April 18), and it is the **architectural critique that motivated the Arbiter design**. The Zicklag April 18 post is a formalization of ideas worked out here.

### 2.1 The Arbiter concept originates here, not in Zicklag's post

Direct quote: *"Since getting a feel for the design sketched out in Diary 4 we've been looking at how we might be able to create a generic service for managing community spaces we're currently calling an arbiter - both a 'space host' and a 'managing app', adding certain common app-level logic around managing community member lists, including an RBAC layer."*

The Arbiter is conceived as **both a space host and a managing app** simultaneously — it terminates the space-owner DID's signing authority AND provides the application-level RBAC machinery that the bare `(DID, Read|Write)` ACL primitive doesn't supply. This dual role is the load-bearing design choice and matches what V11 has been treating as the Arbiter pattern.

### 2.2 Direct disagreement with Diary 5 on URI authority

Meri argues for **user-DID-as-authority** (author-first URI order), against Diary 5's eventual decision for space-DID-as-authority (space-first). The argument has three parts:

1. *"Write enforcement is ultimately handled by readers of the space"* — so the space owner has limited ability to enforce write authority anyway. Authority is *de facto* at the user/PDS level.
2. **Removing a user from a space doesn't and shouldn't delete their records from their own PDS.** The user's records persist regardless of space membership; the user is the durable authority for their own records.
3. **Multi-space record references.** Users may want to reference the same record across multiple spaces without copying. This is impossible if the URI bakes in a single space's authority.

Diary 5 explicitly responds: Holmgren says *"I felt pretty strongly that we should go with the first option [author-first]"* before changing his mind in favor of space-first. The Diary 5 argument is philosophical (the space *is* the authority because it gates inclusion in the member list), practical (space-first works better as a partial URI for tooling), and aesthetic (DID-NSID-string-DID-NSID-string symmetry).

**V11 implication.** This is a real upstream disagreement and Diary 5's resolution is not unanimous in the design community. V11 should follow Diary 5's settled-on order (SPACE first) but be aware that:
- If Meri/Zicklag's design pressure pushes Bluesky to revisit, the order could change.
- The multi-space record reference question is unresolved either way. CSN should consider whether members' records (proposals, votes, signatures) should be space-scoped or user-scoped — i.e., does a cooperative member's vote live in the cooperative's space, in the member's own personal namespace, or referenced from both? This is a §13 question V11 should explicitly surface.

### 2.3 The personal-to-community space ownership transfer problem

Meri surfaces an unsolved problem directly relevant to CSN's lifecycle: what happens when a personal space grows into a community resource?

> *"For example, say Alice is the creator of a small indie game and creates a private forum for users to discuss it, thinking at the time that it's just a fun project. Two years later, the game has become very popular, is now maintained by a 10-person team and the forum has 10,000 users, but every time someone wants to join, this has to go through Alice's PDS. She wants to quit the project and leave her teammates in control of the forum."*

If the personal space's DID was Alice's user DID (per Diary 5's rule for personal data), then:
- The DID document can be updated to point to a different host (PDS migration mechanics).
- A signing key can be delegated to a community-manager service via verification methods.
- But **the root authority is permanently tied to Alice's account.**

This is unresolved in Diary 5. Diary 5's rule ("personal stuff uses the user's DID, social stuff gets its own space DID") works when the lifecycle is known at creation time. It does not work when a personal project becomes a community resource — exactly the cooperative founder pattern.

**V11 implication.** A worker-co-op founder might (or even should) create their early cooperative spaces under their own personal DID, then need to transfer authority to the cooperative DID later. CSN's cooperative-DID lifecycle (§12.2) currently assumes the cooperative DID is established at creation. V11 should add explicit handling for the **personal-to-cooperative migration** case:

- New §12.2 sub-case: "founder-DID-to-cooperative-DID transition." When a member's personal space accrues a community of users, the cooperative provisioning flow needs a mechanism to (a) mint the cooperative DID, (b) re-publish or proxy existing personal-space records under the cooperative DID, (c) coordinate every existing member's re-acceptance into the new space, and (d) handle dangling references from outside the migrated space.
- This is "high-coordination" work per §2.4 below. CSN should not pretend it's cheap.

### 2.4 Space migration is fundamentally high-coordination

Meri: *"With both the space owner and space type NSID being fixed for any given space, we can envision some communities wanting to migrate from one space to another. This is essentially a very high-coordination process - comparable to restoring a PDS backup to a new account after losing control of the DID, with all internal and inbound links broken in the process, but with the added condition that every member needs to be independently involved in the migration."*

**V11 implication.** CSN should explicitly document this cost in §12.2 and the cooperative-lifecycle section. A cooperative that needs to migrate to a new space DID — whether because of platform capture, governance schism, or rebranding — pays a per-member coordination cost. This is a real argument for getting the cooperative DID right at provisioning time AND for designing skey-distinguished sub-spaces from the start (so internal reorganization doesn't require space migration).

### 2.5 Space type NSID is permanent — modality migration constraint

Meri: *"What are the practical implications of the space being permanently tied to the space NSID on the first app?"* If a community wants to migrate from one app's modality to another's — e.g., from a forum-only app to Roomy which supports forum + realtime chat — the NSID being part of the permanent space identity means a smooth modality migration isn't possible. Meri suggests this may motivate more granular consent within a single NSID rather than relying on NSID changes.

**V11 implication.** CSN should pick its cooperative-space NSID(s) carefully because they're permanent for the life of each space. V11 §12.1's commitment to `community.lexicon.governance.*` is the right namespace, but the specific NSID per cooperative-type-of-space is a one-shot choice. The §13 plugin-set design ameliorates this — fine-grained behavior can vary per-plugin without changing the NSID — but the NSID itself is a forever decision.

### 2.6 Open questions Meri raises that V11 should be aware of

- **Are ACLs public?** Can anyone access a space's member list? Or only space members? Or only "am I in" visibility? Diary 5 doesn't answer this. V11 should note the question and make a CSN-side commitment regardless of how upstream resolves it.
- **Could public-read permissioned spaces exist?** Useful for backfill-load reasons (avoiding full firehose subscription) and for "make this Instagram-style toggle public" UX. Relevant to V11's open/mixed/closed cooperative model, which §12.1 retired in favor of per-space decisions — but the upstream concept of a "public-read permissioned space" is a different shape than V11's old binary.
- **Could the `(UserDid, Read|Write)` tuple expand to a richer permission system?** Meri directly suggests *"a lexicon that accompanies the space type NSID"* for fine-grained permissions. **This is exactly what V11's CoopView plugin set is.** V11's 10 plugin interfaces (§13.3) are the affirmative answer: a cooperative's space gets a CoopView extension lexicon whose plugins resolve fine-grained authorization questions that the bare (DID, Read|Write) primitive can't.

### 2.7 The Roomy/Meri/Zicklag axis matters for V11's collaboration strategy

The Arbiter is a Roomy-driven design. The Roomy team has the working prototype that materially shapes what "spaces" will mean in practice. V11's relationship to this work is not just "build on the Arbiter spec" — there isn't a spec, there's an evolving working design between Meri, Zicklag, and the broader Bluesky/permissioned-data conversation.

**V11 implication.** Section 17 ("Open Questions for Community") should add an item: engage directly with Meri and Zicklag on the personal-to-community DID transition, the multi-space record reference question, and the CoopView-plugin-set-as-answer-to-fine-grained-ACL question. These three threads connect CSN's design directly to a live upstream conversation.

---

## 3. HappyView v2 — correction

Source of truth migrated to **Tangled**:

- Source: `tangled.org/gamesgamesgamesgames.games/happyview`
- Docs: `happyview.dev`
- Container image: `ghcr.io/gamesgamesgamesgamesgames/happyview:latest` (still on GHCR despite source move)

**v2 architectural changes:**

| v1 | v2 |
|---|---|
| HappyView + Tap + AIP (3 services) | Single HappyView binary |
| Postgres only | SQLite (default) or Postgres |
| AIP handles OAuth | Built-in atproto OAuth with DPoP |
| Tap handles indexing + backfill | Built-in Jetstream streaming + backfill |
| Offset-based pagination | Cursor-based pagination |
| Admin bootstrapping via config | First authenticated user becomes admin |

**v2 features relevant to V11:**

- **WASM plugins** for external platform integration (plausible host surface for CSN-specific governance logic; not the V11 plan, but a pattern study).
- **Labeler subscriptions** via `atproto.get_labels` / `atproto.get_labels_batch` Lua APIs. Directly relevant to §12.1's governance-labels-via-`$labeler`-space decision.
- **Lua scripts and index hooks.** Hook composition mirrors V11's GovernanceView/CoopView hook composition (§13.4) closely enough to be a useful reference.
- **Granular user permissions** with Viewer/Operator/Manager/Full Access templates.

V11's framing of "HappyView 2.5+ as reference implementation only" is correct: generic atproto AppView framework, not a CSN-specific stack.

---

## 4. What didn't change from the earlier draft

- **Diary 4 ("The Big Picture", March 20, 2026)** remains the canonical big-picture statement. Diary 5 builds on it without contradicting.
- **Spring 2026 Roadmap, IETF ATP WG charter, Discussion #4437** unchanged in the window. The `com.atproto.*`-excluded-from-permission-sets fact still holds and still matters for V11's OAuth seam.
- **Lexicon Community, Private Data WG Discourse, opensocial.community, NorthSky, Blacksky, Tangled** — no substantive new public activity in the window beyond what was in the earlier draft.

---

## 5. Revised recommendations for V11

### 5.1 Rescinded from the earlier draft

- ~~"Purge from §12 and §13 any commitments that cite Diary 5, HappyView v2.5.0, or the Zicklag $publish/$labeler addendum."~~ Diary 5 and HappyView v2 are real; their citations stay. The Zicklag $publish/$labeler addendum is shelved per Alan's direction (not chased further).

### 5.2 Confirmed or new

1. **Update §13's URI strawman to SPACE-first order.** Diary 5 settles this. CSN strawman should match `ats://space_did/space.type/skey/author_did/collection/rkey`. Note that this is contested by Meri/Zicklag (see §2.2 above); the resolution could shift.

2. **Treat skey as a first-class primitive, not an edge case.** Model cooperatives as one DID with multiple skey-distinguished spaces. The per-(coop, member) personal-space pattern in §12.1 is reinforced — this is the normal shape, not an expensive workaround.

3. **Soften the URI scheme commitment.** §12.3 should say "non-`at://` scheme, leading candidate `ats://`" rather than treating `ats://` as fixed.

4. **Keep the cooperative-DID-distinct-from-user-DID commitment** — Diary 5 reinforces it.

5. **Trim assumptions about a rich controlled-account API on the PDS.** Any V11 feature wanting generic managed-account capability should live in CSN's AppView, not assume PDS support.

6. **Frame cooperatives by modality, not as cross-modality circles.** A cooperative's governance modality is one space type. Forum, chat, calendar etc. are separate spaces under the same cooperative DID with their own modality NSIDs.

7. **Plan for the access-control diary as next likely refinement vector** — sync may be delayed by post-quantum-signatures considerations.

8. **HappyView v2 patterns to study, not adopt:** WASM-plugins-plus-Lua-hooks composition, labeler subscriptions as first-class primitive, granular per-user permission templates.

### 5.3 New from Meri's post (§2)

9. **Add a §12.2 sub-case for founder-DID-to-cooperative-DID transition.** Worker-co-op founders may legitimately create early cooperative spaces under their personal DID and need to transfer authority later. CSN should design for this explicitly: cooperative-DID minting, record re-publication or proxying, per-member re-acceptance, and dangling-reference handling. This is the unsolved-upstream personal-to-community transition problem applied directly to CSN's founder pattern.

10. **Explicitly document space-migration cost in §12.2 and the cooperative-lifecycle section.** Space migration is high-coordination — every member must be independently involved. This is a real argument for getting the cooperative DID right at provisioning time AND for designing skey-distinguished sub-spaces from the start, so internal reorganization doesn't require space migration.

11. **Choose cooperative-space NSIDs deliberately and document the permanence.** The NSID is fixed for the life of each space. V11 §12.1's commitment to `community.lexicon.governance.*` is the right namespace, but each specific NSID-per-cooperative-type-of-space is a one-shot choice. The plugin set ameliorates fine-grained behavior; the NSID itself is forever.

12. **Surface the multi-space record reference question in §13.** Should a cooperative member's vote live in the cooperative's space, in the member's own personal namespace, or be referenced from both? Diary 5 left this unresolved. V11 should make a CSN-side commitment, knowing the upstream answer may force later revision.

13. **Add a CSN-side commitment on ACL visibility.** Three options: ACLs are public, ACLs are members-only, or ACLs surface only "am I in" visibility. Upstream is unresolved. CSN should pick a default and document the rationale, with an override path if upstream resolves differently.

14. **Document the Roomy/Meri/Zicklag axis in §17 Open Questions for Community.** Direct engagement with Meri and Zicklag on (a) personal-to-community DID transition, (b) multi-space record references, (c) CoopView-plugin-set-as-answer-to-fine-grained-ACL is materially valuable. V11 should plan outreach as part of the upstream-engagement track.

### 5.4 Refresh cadence

The 2-week refresh cadence stands, with one process change: **direct URL fetches of known endpoints**, not search-driven discovery. The watchlist:

- `dholms.leaflet.pub` (Holmgren's diaries)
- `zicklag.leaflet.pub` (Zicklag's posts)
- `meri.leaflet.pub` (Meri's posts — newly added)
- `happyview.dev`
- `tangled.org/gamesgamesgamesgames.games/happyview`
- `github.com/bluesky-social/atproto/compare/permissioned-data`
- The Discourse Private Data WG
- @atproto/oauth-scopes npm version
- `blog.muni.town` (Roomy roadmap)

---

## 6. Assessment: addendum findings against the architecture direction document

The §5 recommendations were drafted before a careful read of `2026-05-08-csn-architectural-direction.md`. On re-reading, most of §5 is either already incorporated in the architecture doc or is premature to act on. This section assesses each finding against the doc's actual content and identifies the small set of additions that are worth making now. **Where §6 and §5 conflict, §6 supersedes.**

The architecture direction document was written on May 8, 2026 — the same day Diary 5 was published — and cites Diary 5 eight times across §§2.1, 2.2, 6.1, 6.6, and 12.3. HappyView v2.5.0 is cited in §§0, 2.3, and 5.6. The §13 strawman already made space identity order-agnostic and scheme-agnostic; later V11 work tightened that into the canonical `{ arbiterDid, spaceKey, expectedSpaceType? }` shape. The §12.3 substrate-vs-load-bearing framing already does most of the conceptual isolation work this addendum's findings imply. The doc anticipates almost everything Diary 5 settled.

### 6.1 Already in the doc (no action needed)

| Addendum finding | Where it's already addressed in the architecture doc |
|---|---|
| Diary 5 settles URI order SPACE-first | §2.1, §13 strawman uses `SpaceRef` consistent with SPACE-first |
| Spaces have their own DIDs | §2.1, §6.1 |
| Controlled DIDs scoped tightly | §2.2, §6.1 |
| Space type as NSID = OAuth consent boundary | §2.1, §4.1 |
| URI scheme still undecided | §2.2 explicitly notes "taking suggestions" |
| Skey / multiple spaces per DID | §3.3 mapping table, §6.6 |
| Sketch implementation branch exists | §2.2 |
| HappyView v2.5.0 with permissioned-spaces flag | §2.3, §5.6 |
| Sync protocol details may shift | §2.2, §12.3 marks sync as substrate |
| Spaces ≠ circles (modality-bound) | Implicit in §4.1, §6 — space types are NSIDs |

### 6.2 Worth folding in now (small, mechanical, no design risk) — **COMPLETE**

**Status: COMPLETE.** All four additions applied to `2026-05-08-csn-architectural-direction.md` on May 11, 2026. The recommendations below are preserved for traceability, each annotated with where it was applied.

1. ✅ **Meri's co-authorship of the Arbiter pattern.** Applied to §3.1 (opening sentence now reads *"The Arbiter (formalized by Zicklag, April 18, 2026, building on the architectural critique Meri published April 10)..."*) and §3.5 (paragraph 2 now reads *"The Arbiter is being designed by Meri and Zicklag primarily for Roomy."*). §11.1 opening and closing also updated to name Meri and Zicklag jointly.

2. ✅ **§11.1 reframe: position the plugin set as the cooperative use case's answer to Meri's open question.** New paragraph inserted into §11.1 before the closing "contribution not critique" paragraph, explicitly quoting Meri's *"perhaps a lexicon that accompanies the space type NSID"* and framing V11's plugin set (§13.3) as the affirmative answer — with the NSID-as-substrate-plus-typed-plugin-as-superstructure pattern named as a generalizable contribution.

3. ✅ **§12.3 refinement: URI scheme token is substrate; semantic distinction is load-bearing.** The load-bearing bullet about `ats://`-vs-`at://` was replaced with: *"The semantic distinction between permissioned and public URI resolution. The specific scheme token (ats:// is the leading candidate per Diary 5, but Holmgren is explicit that it's not yet decided) is substrate; the fact that permissioned URIs resolve through a different protocol and must be visually distinct from public URIs is load-bearing."*

4. ✅ **Meri's April 10 post added to References section** under Ecosystem sources, chronologically positioned before the Zicklag April 18 Arbiter post. Annotated as *"architectural critique that motivated the Arbiter design; co-authored with Zicklag."*

All edits applied via a single `Filesystem:edit_file` call. No conflicts, no manual cleanup required. The architecture direction document is now current with the May 11 ecosystem scan findings.

### 6.3 Premature to fold in (genuinely waiting on upstream)

The following §5 recommendations are either already implicitly handled by the doc's existing posture or depend on upstream signal that hasn't arrived:

- **URI authority contestation (§5.3 item from §2.2).** Diary 5 settled SPACE-first/space-DID-authority. Meri's user-DID argument is real but not unanimous upstream. Acting on this would mean committing to a side. The §13 strawman's `SpaceRef` and plugin interfaces don't depend on URI authority semantics — CSN is already insulated. **Don't fold in.** If upstream flips, the §13 strawman absorbs the change.

- **§5.3 item 9 (founder-personal-DID → cooperative-DID transition).** Real upstream gap. But §12.2 already commits CSN to "cooperatives own their DIDs" from provisioning. CSN sidesteps the problem by never letting cooperatives accumulate state under a founder's personal DID. The doc's existing posture is correct; the gap is not CSN's to solve. **Optional one-sentence note in §12** acknowledging the sidestep is deliberate; otherwise no action.

- **§5.3 item 10 (space-migration cost documentation).** §9.6 covers the easy case (PDS move with DID unchanged). The hard case (DID itself changes) isn't addressed. But this is upstream's problem and may never be solved at the protocol level. **Better to note as a known limitation than design around it.** Optional addition to §9.6; no action otherwise.

- **§5.3 item 11 (NSID permanence).** §13's plugin set abstracts over NSIDs. **No action needed.**

- **§5.3 item 12 (multi-space record reference question).** Genuine open question, but speculative for V11. Should be flagged in §12.8 (items still genuinely open) only if explicit listing helps; otherwise wait until upstream surfaces a concrete proposal.

- **§5.3 item 13 (ACL visibility commitment).** Pick a default when implementation reaches the relevant code, not now. The doc's existing posture (per-space placement, no binary visibility) already provides flexibility.

- **§5.3 item 14 (engagement plan addition for Meri/Zicklag).** Subsumed by §6.2 item 1 above — naming Meri across §11 covers this without a separate items list.

The pattern: most of the §5.3 "new from Meri's post" items reinforce existing doc posture rather than overturning it. The doc is more current than the §5.3 framing implied.

### 6.4 How key decisions are likely to go

Predicting upstream design outcomes is a probability exercise. Best estimates based on the current state of Diary 5, the Roomy/Meri/Zicklag axis, and Bluesky's stated direction:

| Open question | Likely outcome | Confidence | Risk to V11 if wrong |
|---|---|---|---|
| URI scheme | `ats://` survives | 70–80% | Low — URI helpers abstract the scheme |
| URI order | SPACE-first (per Diary 5) | 80–85% | Low — `SpaceRef` is swappable |
| URI authority | space-DID (per Diary 5) | 65–70% | Low — plugins don't depend on URI authority semantics |
| Controlled-DID API scope | Minimal (transfer + rotation only) | 85% | Low — V11 already doesn't depend on rich PDS APIs |
| Personal-to-community transition | No upstream solution in 12 months | 80% | Low — CSN sidesteps via cooperative-DID-at-provisioning |
| Fine-grained ACL expansion | 50/50 upstream solution in 18 months | — | None — V11's plugin set is the CSN-side answer regardless |
| ACL visibility convention | 50/50 consistent answer in 12 months | — | Low — CSN picks default, adjusts if upstream lands different |
| Public-read permissioned spaces | ~35% upstream support | — | None — V11 doesn't need it |
| Sync protocol substrate (ECMH, post-quantum) | ~50% probability of substrate changes | — | Low — §12.3 already marks sync as substrate |
| `$publish` / `$labeler` formalization | ~70% formalized in some form | — | Low — §6.9 plans for CSN to do standardization work if needed |
| OAuth-spaces seam (app auth within space) | ~50% resolution in 6 months | — | **Medium** — but §12.7 plans seam writeup with sketchable parts now |

The pattern is clear: **most genuinely-load-bearing decisions for V11 have already gone the way the architecture doc assumes.** The residual risk concentrates in the OAuth-spaces seam (§4.2), which §12.7 already identifies as the most important parallel work item. Everything else is either substrate (insulated by abstraction) or sidestepped by V11's existing posture.

### 6.5 How CSN isolates itself from changes in the spaces domain

The architecture doc already does most of the insulation work. Six layers of isolation, with one small refinement recommended:

1. **Substrate vs. surface distinction (§12.3 design pivot policy).** The doc's distinction between "load-bearing" (would force replanning) and "substrate" (abstracted behind ports) is the right framing. The one refinement is §6.2 item 3: move `ats://`-vs-`at://` URI semantics from load-bearing to "the *semantic distinction* between permissioned and public URI resolution is load-bearing; the specific scheme token is substrate." Diary 5 explicitly leaves the token open.

2. **No dependence on rich PDS-level APIs (§6.1, §6.7).** §6.1 commits cooperative DID management to a minimal controlled-DID API. §6.7 puts operator auth in the Arbiter layer, not the PDS. Anything that wants generic managed-account capability lives in CSN's AppView. Solid.

3. **The plugin set IS the isolation layer (§13).** The 10 plugin interfaces are CSN's contract with itself; upstream space mechanics are implementation details behind them. If Bluesky changes how spaces work, only `GovernanceView`'s internals change; plugin interfaces stay stable; `CoopView` is unaffected. **This is the single most important insulation property V11 has.** The §13.8 "what this strawman commits to" language is good but could be sharper: the plugin boundary is not just a layer separation — it's the abstraction that survives upstream protocol pivots.

4. **Cooperative DIDs from provisioning (§12.2).** Sidesteps the personal-to-cooperative transition problem entirely. Founders never accumulate cooperative state under their personal DID. This is a CSN-side design choice that doesn't depend on upstream resolution.

5. **Defer where upstream is arguing (§12.8).** Genuinely open items are listed honestly. §12.7 plans parallel work that doesn't depend on upstream resolution. The posture is correctly "code against substrate, defer surface."

6. **Make every NSID / scheme / syntax choice a variable, not a constant.** §13.3's `SpaceRef` is the pattern. URI helpers, scheme tokens, ACL syntax should all follow it: encapsulated in one place, swappable.

The insulation strategy can be summarized in one sentence: **CSN codes against the durable substrate (DIDs, signing keys, cryptographic commits, lexicons-as-NSIDs, OAuth+DPoP, space-as-perimeter, member-list-as-(DID, R|W)), not the changing surface (specific URI token, exact ACL syntax, exact sync wire format, exact permission set list).** The four-layer architecture (Spaces → Arbiter → GovernanceView → CoopView) means each layer can churn without forcing the layer above it to change.

### 6.6 Recommendation

**Don't fold the addendum into the architecture direction document as a major edit.** The doc is already current with the protocol design as of May 8, 2026, and most of the addendum's findings (Diary 5 substance, HappyView v2.5.0 details, design pivot policy) are already incorporated.

**Do make the four small additions identified in §6.2** — **COMPLETE** as of May 11, 2026. All four edits have been applied to the architecture direction document; see §6.2 for details on each.

**Treat this addendum as a watchlist artifact going forward** (see §7). The 2-week refresh cadence with direct URL fetches (now including `meri.leaflet.pub`) catches new upstream signal. The architecture doc only needs to change when a watchlist refresh surfaces something load-bearing — not on every diary or post. The OAuth-spaces seam (§4.2 in the architecture doc) is the most likely source of upstream signal that forces real edits; everything else is substrate or already sidestepped.

---

## 7. Process note (for future scans)

The failure mode in the earlier draft is recurring: **search-driven research misses fresh content and content on niche infrastructure**, and conclusions of the form "X does not exist" from search-misses are unreliable.

Going forward, the expected workflow:

1. Try direct URL fetches of canonical endpoints first (watchlist above).
2. Fall back to search only for discovery of *new* threads not on the watchlist.
3. Conclusions of "could not find" must be marked as search-misses, not as nonexistence claims, unless direct fetch of the canonical URL returns a definite negative (404, empty page, "no such post").
4. When Alan provides a canonical URL, fetch it directly rather than searching for it.

The Meri post discovery in this round is a case in point: a single URL provided by Alan turned out to contain the most important architectural context in the entire scan, including the provenance of the Arbiter pattern and a contested upstream design question that directly affects V11's URI strawman.
