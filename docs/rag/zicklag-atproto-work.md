https://zicklag.leaflet.pub/3mgy2sbswl22f

https://zicklag.leaflet.pub/3mjrvb5pul224


# References: Zicklag's ATProto Contributions & Architecture

A curated list of technical references, blog posts, and specifications covering Zicklag's work on the AT Protocol (ATProto), decentralized spaces, arbiters, and governance models.

---

## 🛠️ Zicklag's Core Architectural Work & Proposals

### 1. The Arbiter & Permissioned Spaces Proposal
* **URL:** `https://leaflet.pub`
* **Focus:** Outlines a custom design for "The Arbiter," a modular group-management service built to layer seamlessly onto ATProto's native permissioned-data frameworks.

### 2. Roomy Deep Dive: ATProto + Automerge
* **URL:** `https://muni.town`
* **Focus:** Explains how local-first Conflict-free Replicated Data Types (CRDTs) handle state synchronization and offline data ownership alongside ATProto Personal Data Servers (PDS).

### 3. Leaf, ATProto, and ActivityPub
* **URL:** `https://muni.town`
* **Focus:** Explores "Subspaces"—hierarchical file-system-style data layers featuring granular Access Control Lists (ACLs) and private data replication strategies.

### 4. Plyr.fm Ecosystem Alignment (Issue #1384)
* **URL:** `https://github.com`
* **Focus:** Tracking issue detailing developer collaboration to integrate ATProto's permissioned-data substrates based on Zicklag's decentralized state models.

### 5. Evolution of Roomy's Architecture
* **URL:** `https://muni.town`
* **Focus:** Detailed technical retrospectives on switching underlying frameworks to optimize decentralized access controls and peer-to-peer data distribution.

---

## 🌐 Related Protocol Specifications & Governance Ecosystem

To understand how these community experiments align with the official protocol design, consult the following baseline specifications:

### 1. ATProto Core Permissions Specification
* **URL:** `https://atproto.com`
* **Focus:** The official architectural specification governing cryptographic permissions, identities, and secure RPC endpoints across the network.

### 2. ATProto Product Roadmap & Permissioned Data
* **URL:** `https://atproto.com`
* **Focus:** Details the core development schedule for deploying native permissioned data substrates across the entire protocol ecosystem.

### 3. Early Permission Sets & Scoping Forums
* **URL:** `https://github.com`
* **Focus:** Public architectural discussions outlining token scopes, capability sets, and data isolation strategies between discrete app namespaces.

---

## 📊 Architectural Comparison: Local-First (Automerge) vs. Standard ATProto Sync

Zicklag's work on Roomy introduces a hybrid model that heavily leverages Automerge. Below is a high-level technical comparison between his approach and ATProto's default repository mechanisms:

| Architectural Dimension | Standard ATProto Repo Sync (`mst`) | Zicklag's Hybrid Approach (Automerge + PDS) |
| :--- | :--- | :--- |
| **Data Structure** | Content-Addressed Merkle Search Trees (MST). | Conflict-free Replicated Data Types (CRDT). |
| **Primary Topology** | Hub-and-Spoke via Personal Data Servers (PDS) and Big Graph Indexers (Relays). | Peer-to-Peer (P2P) mesh syncing directly between devices, anchored by a PDS. |
| **State Resolution** | Append-only repository blocks where the last signed state wins. Forking requires separate DIDs. | Automatic branch-merging with deep causal tracking, tracking concurrent user edits seamlessly. |
| **Network Dependency** | Relies on an active, reachable PDS to commit and broadcast signed repository records. | Local-first; apps run entirely offline and sync updates immediately upon re-establishing a peer connection. |
| **Multi-User Spaces** | Repos are fundamentally single-user (one DID per repo). Shared spaces require complex app-view aggregation. | Multi-user by design; multiple authors can concurrently read/write to the exact same shared document or space. |
| **Access Control (ACL)** | Open data by default; cryptographic visibility frameworks are currently being layered on top. | Fine-grained local capabilities where cryptographic permissions are enforced directly inside the CRDT layer. |
