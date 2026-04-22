# Adaptive Indexing Engine
## Project Documentation — Advanced Data Structures (Semester 4)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Algorithms Used & Why](#4-algorithms-used--why)
5. [Data Structure Internals](#5-data-structure-internals)
6. [Adaptive Promotion Mechanism](#6-adaptive-promotion-mechanism)
7. [Complexity Analysis](#7-complexity-analysis)
8. [API Reference](#8-api-reference)
9. [Project Advantages vs Alternatives](#9-project-advantages-vs-alternatives)
10. [Folder Structure](#10-folder-structure)
11. [Build & Run Instructions](#11-build--run-instructions)
12. [Examiner Q&A — Anticipated Questions](#12-examiner-qa--anticipated-questions)

---

## 1. Project Overview

**Adaptive Indexing Engine** is a hybrid key-value storage system that combines two
complementary data structures — a **B+ Tree** and an **AVL Tree** — and automatically
migrates "hot" (frequently accessed) keys from the B+ Tree into the AVL Tree. This
mirrors the concept used in real-world database systems where a buffer pool or cache
stores hot records in faster memory while cold records remain on slower disk storage.

### Core Idea

| Layer | Structure | Analogy |
|---|---|---|
| Primary / Cold Store | B+ Tree | Hard disk / SSD |
| Hot Cache | AVL Tree | RAM / CPU cache |

All keys start in the B+ Tree. Every search increments an **access counter** for that
key. Once the counter exceeds a configurable **promotion threshold** (default = 3),
the engine automatically **promotes** the key — removes it from the B+ Tree and
re-inserts it into the AVL Tree. Future searches check the AVL Tree first, yielding
faster access for hot data.

A **live web dashboard** visualizes both trees in real time, showing AVL node balance
factors, B+ leaf blocks, statistics, and one-shot animations on search/insert events.

---

## 2. Tech Stack

### Backend

| Component | Technology | Version |
|---|---|---|
| Language | C++ | Standard: C++17 |
| Build System | CMake | ≥ 3.20 |
| HTTP Server | Custom Crow-compatible server (`crow_all.h`) | Header-only |
| Compiler (Windows) | MSVC (via Visual Studio Build Tools) | — |
| Data Format | JSON (hand-serialized via Crow's `json::wvalue`) | — |

**Why C++17?**
- `std::optional<T>` — used for nullable search results without raw pointers
- Structured bindings and lambda captures
- `std::string_view` compatibility
- Full STL algorithms (`std::lower_bound`, `std::max`)

### Frontend

| Component | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, grid, flex, CSS animations) |
| Logic | Vanilla JavaScript (ES2020, async/await, fetch API) |
| Tree Visualization | SVG (inline, generated dynamically by JS) |
| HTTP Client | `fetch()` API |

**No frameworks used** — zero dependencies on React, Vue, Angular, jQuery, or any
external CSS library. This keeps the build simple and the code fully inspectable.

### Communication Protocol

```
Browser ──── HTTP/1.1 GET ────► C++ Crow Server (port 18080)
        ◄─── JSON response ────
```

CORS (`Access-Control-Allow-Origin: *`) is handled server-side so the frontend can
be opened directly from the filesystem or a local web server.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  FRONTEND (Browser)                     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────┐  │
│  │  Insert  │  │  Search  │  │Statistics │  │ Docs  │  │
│  │   Tab    │  │   Tab    │  │   Tab     │  │  Tab  │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └───────┘  │
│       │              │              │                    │
│       └──────────────┴──────────────┘                   │
│                       │                                 │
│              fetch() HTTP GET                           │
│                       │                                 │
└───────────────────────┼─────────────────────────────────┘
                        │  HTTP/1.1 on localhost:18080
┌───────────────────────▼─────────────────────────────────┐
│                  BACKEND (C++ Server)                   │
│                                                         │
│   /insert?key=&value=    /search?q=    /stats           │
│          │                    │           │             │
│          └────────────────────┴───────────┘             │
│                        │                                │
│          ┌─────────────▼──────────────┐                 │
│          │   AdaptiveIndexingEngine   │                 │
│          │  (engine.cpp / engine.h)   │                 │
│          └───────┬──────────┬─────────┘                 │
│                  │          │                           │
│      ┌───────────▼──┐  ┌────▼──────────┐               │
│      │   AVL Tree   │  │   B+ Tree     │               │
│      │  (avl.cpp)   │  │(bplustree.cpp)│               │
│      │  In-memory   │  │ Disk-like     │               │
│      └──────────────┘  └───────────────┘               │
└─────────────────────────────────────────────────────────┘
```

### Request Flow — Insert

```
Client sends: GET /insert?key=42&value=student_data

Engine::insert(42, "student_data")
  │
  ├─ Is key 42 already in AVL?  YES ──► avl_.insert(42, value)
  │
  └─ NO ──► bplus_.insert(42, value)   [default path for new keys]

Response: { key, value, location, accessCount }
```

### Request Flow — Search

```
Client sends: GET /search?q=42

Engine::search(42)
  │
  ├─ Step 1: avl_.search(42)
  │   ├─ FOUND ──► return { value, location:"AVL Tree", accessCount }
  │   └─ NOT FOUND ──► continue
  │
  └─ Step 2: bplus_.search(42)
      ├─ NOT FOUND ──► return nullopt (404)
      └─ FOUND ──► increment accessCount
          │
          ├─ accessCount > threshold?
          │   YES ──► bplus_.remove(42) ──► avl_.insert(42, value, accessCount)
          │           ++promotions_
          │           return { location: "AVL Tree" }
          │
          └─ NO ──► return { location: "B+ Tree" }
```

---

## 4. Algorithms Used & Why

### 4.1 AVL Tree (Adelson-Velsky and Landis Tree)

**What it is:** A self-balancing Binary Search Tree where the height difference
(balance factor) between the left and right subtree of any node is always **−1, 0, or +1**.

**Why AVL and not Red-Black Tree?**

| Criterion | AVL Tree | Red-Black Tree |
|---|---|---|
| Balance guarantee | Strict: \|Δ\| ≤ 1 | Loose: height ≤ 2·log(n) |
| Search performance | Faster (shorter height) | Slightly slower |
| Insert/Delete cost | More rotations | Fewer rotations |
| Use case fit | Read-heavy (hot key cache) | Write-heavy systems |
| Academic clarity | Simpler to explain | More complex coloring rules |

Since the AVL Tree in this engine stores **hot keys that are searched repeatedly**,
it is read-heavy. AVL's stricter balance gives better worst-case search time, which
is exactly what we need for a "fast cache" layer.

**Why AVL and not a Hash Table?**

A hash table gives O(1) average search but:
- Does not support **range queries**
- Does not maintain **sorted order**
- Worst case is O(n) with hash collisions
- Cannot be **visualized** as a meaningful tree structure

AVL Trees provide O(log n) **guaranteed worst-case** lookup, sorted traversal,
and a clear hierarchical visualization — better for academic demonstration.

**Rotations implemented:**

```
Left-Left (LL) Case ──► Right Rotation
         z                     y
        / \                   / \
       y   T4   ──────►      x   z
      / \                   /\  / \
     x   T3                T1 T2 T3 T4

Right-Right (RR) Case ──► Left Rotation
     z                         y
    / \                       / \
   T1   y        ──────►     z   x
       / \                  / \ / \
      T2   x               T1 T2 T3 T4

Left-Right (LR) Case ──► Left Rotation on child, then Right Rotation
Right-Left (RL) Case ──► Right Rotation on child, then Left Rotation
```

**Code location:** [include/avl.h](include/avl.h), [src/avl.cpp](src/avl.cpp)

---

### 4.2 B+ Tree (Leaf-Only Variant)

**What it is:** An order-preserving tree where all data is stored in **leaf nodes**
linked in a sorted singly-linked list. Internal nodes hold separator keys to route
searches — however, in this implementation, only the **leaf layer** is maintained
(a simplified leaf-linked-list B+ Tree with capacity-based splitting).

**Split threshold:** default 4 keys per leaf node (configurable). A leaf splits when it reaches the threshold.

**Why B+ Tree and not Binary Search Tree for primary storage?**

| Criterion | B+ Tree | Plain BST |
|---|---|---|
| All data in leaves | YES — good for scans | No |
| Leaf linked list | YES — fast range scan | No |
| Disk page friendly | YES — fills pages | No |
| Sorted sequential access | O(n) via leaf chain | O(n) in-order traversal |
| Balanced by design | YES (splits) | No |

**Why B+ Tree and not B-Tree?**

| Criterion | B+ Tree | B-Tree |
|---|---|---|
| Data location | Only in leaves | In all nodes |
| Range query | O(log n + k) via leaf chain | O(k·log n) — must backtrack |
| Deletion complexity | Simpler (only leaves) | More complex |

**Leaf splitting algorithm:**

```
Before split (threshold = 5, inserting 5th key):
  Leaf:  [10, 20, 30, 40, 50]
                    ^
                  mid = 2

After split:
  Leaf A: [10, 20]  ──next──►  Leaf B: [30, 40, 50]
```

**Access-count tracking:** Each leaf entry maintains its own `accessCount` integer.
Every call to `bplus_.search(key)` increments the counter for that entry. This
counter is the trigger for promotion.

**Code location:** [include/bplustree.h](include/bplustree.h), [src/bplustree.cpp](src/bplustree.cpp)

---

### 4.3 Adaptive Promotion Algorithm

**What it is:** A **runtime access-pattern-driven migration** algorithm — not a
classical DSA algorithm but an original design that applies the concept of
**locality of reference** (a principle from operating systems and CPU caching).

**The algorithm:**

```
FUNCTION search(key):
    IF avl.contains(key):
        RETURN avl.search(key)        // O(log n) — fast path

    result = bplus.search(key)        // O(n) — slow path
    IF result is NULL:
        RETURN NOT_FOUND

    IF result.accessCount > THRESHOLD:
        entry = bplus.remove(key)     // migrate out of B+
        avl.insert(key, entry.value, entry.accessCount)  // promote to AVL
        promotions++
        RETURN { location: "AVL Tree", ... }

    RETURN { location: "B+ Tree", ... }
```

**Why this is useful:**
- First few accesses: cheap B+ Tree lookup
- After threshold: automatic promotion, all future lookups are O(log n) AVL
- No manual configuration needed — the engine adapts to the workload

**Analogy:** Like an operating system's **LFU (Least Frequently Used) cache policy**
in reverse — instead of evicting cold items, we promote hot items.

---

## 5. Data Structure Internals

### AVL Tree Node

```cpp
struct Node {
    int         key;          // Integer search key
    std::string value;        // Associated data
    int         height;       // Height of subtree rooted here
    int         accessCount;  // Times this key was searched
    Node*       left;
    Node*       right;
};
```

The `accessCount` field is **preserved across promotions** — when a key moves from
B+ Tree to AVL Tree, its access count is carried over via the `initialAccessCount`
parameter of `avl_.insert()`.

### B+ Tree Leaf Node

```cpp
struct LeafNode {
    std::vector<int>         keys;         // Sorted keys
    std::vector<std::string> values;       // Corresponding values
    std::vector<int>         accessCounts; // Per-key access counter
    LeafNode*                next;         // Linked list pointer to next leaf
};
```

Parallel arrays (keys / values / accessCounts) keep all per-entry data aligned by
index. `std::lower_bound` is used for O(log k) insertion position within a leaf
(where k = leafCapacity = 4, so effectively O(1) in practice).

### Promotion Data Flow

```
B+ Tree leaf entry:
  { key=42, value="alice", accessCount=4 }
        │
        │  bplus_.remove(42) returns BPlusEntry
        ▼
AVL Tree new node:
  { key=42, value="alice", height=1, accessCount=4, left=null, right=null }
```

---

## 6. Adaptive Promotion Mechanism

### Sequence Diagram

```
User        Frontend        Backend         B+ Tree       AVL Tree
 │               │               │               │              │
 │  search(42)   │               │               │              │
 │──────────────►│               │               │              │
 │               │ GET /search?q=42              │              │
 │               │──────────────►│               │              │
 │               │               │ search(42)    │              │
 │               │               │──────────────►│              │
 │               │               │ {val, count=4}│              │
 │               │               │◄──────────────│              │
 │               │               │ count > 3?    │              │
 │               │               │ YES: remove   │              │
 │               │               │──────────────►│              │
 │               │               │               │ avl.insert   │
 │               │               │──────────────────────────────►
 │               │               │ { location:"AVL Tree" }      │
 │               │◄──────────────│               │              │
 │  "AVL Tree"   │               │               │              │
 │◄──────────────│               │               │              │
```

### Threshold Visualization (default threshold = 3)

```
Search #1: B+ Tree (accessCount = 1)  →  No promotion
Search #2: B+ Tree (accessCount = 2)  →  No promotion
Search #3: B+ Tree (accessCount = 3)  →  No promotion
Search #4: B+ Tree (accessCount = 4)  →  4 > 3  →  PROMOTE to AVL!
Search #5: AVL Tree (fast path)       →  O(log n), no B+ lookup needed
```

---

## 7. Complexity Analysis

### AVL Tree

| Operation | Time Complexity | Space Complexity | Notes |
|---|---|---|---|
| Insert | O(log n) | O(log n) stack | Max 2 rotations per insert |
| Search | O(log n) | O(1) iterative | Iterative `find()` — no recursion |
| Contains | O(log n) | O(1) | Same iterative find |
| Snapshot (in-order) | O(n) | O(n) | Recursive collect |
| Rotation | O(1) | O(1) | 4 pointer assignments + 2 height updates |

Height guarantee: h ≤ 1.44·log₂(n+2) − 0.328

### B+ Tree (Leaf-Only)

| Operation | Time Complexity | Notes |
|---|---|---|
| Insert | O(n/k) average, O(n) worst | Linear scan to find leaf; k = leafCapacity |
| Search | O(n/k) average | Linear scan through leaves |
| Remove | O(n) | Linear scan through all leaves |
| Split | O(k) | Copy half-leaf to new node |
| Range Scan | O(k + r) | Follow next pointers |
| Snapshot | O(n) | Traverse leaf linked list |

> Note: This is a simplified leaf-linked-list B+ Tree without an internal node
> index layer. Adding an internal node layer would reduce insert/search to O(log n).
> The current design prioritizes simplicity and educational clarity.

### Engine (Combined)

| Operation | Time | Notes |
|---|---|---|
| insert(key) | O(n/k) or O(log n) | B+ if new key, AVL if already there |
| search(key) — hot | O(log n) | Checked in AVL first |
| search(key) — cold, no promote | O(n/k) | B+ only |
| search(key) — cold, promote | O(n/k) + O(log n) | B+ search + remove + AVL insert |
| stats() | O(1) | Cached counters |
| avlSnapshot() | O(n_avl) | In-order collect |
| bplusSnapshot() | O(n_bplus) | Leaf chain traversal |

---

## 8. API Reference

The C++ Crow server exposes three HTTP endpoints on `http://localhost:18080`.

### GET `/insert`

Insert a key-value pair into the engine.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `key` | integer | The lookup key (must be a valid integer) |
| `value` | string | Associated data string |

**Example:**
```
GET http://localhost:18080/insert?key=42&value=student_data
```

**Response (200 OK):**
```json
{
  "key":         "42",
  "value":       "student_data",
  "location":    "B+ Tree",
  "accessCount": "0"
}
```

`location` is `"AVL Tree"` if the key already existed in AVL (re-insert).

---

### GET `/search`

Search for a key. Increments access count and may trigger promotion.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `q` | integer | The key to search for |

**Example:**
```
GET http://localhost:18080/search?q=42
```

**Response (200 OK — found):**
```json
{
  "key":         "42",
  "value":       "student_data",
  "location":    "AVL Tree",
  "accessCount": "4"
}
```

**Response (400 Bad Request — not found):**
```json
{ "error": "not found" }
```

---

### GET `/stats`

Returns current engine statistics and full tree snapshots for visualization.

**Example:**
```
GET http://localhost:18080/stats
```

**Response (200 OK):**
```json
{
  "avlNodeCount":   "3",
  "bplusNodeCount": "7",
  "totalSearches":  "15",
  "promotions":     "2",
  "avlNodes": [
    { "key": "10", "value": "alpha", "accessCount": "5" },
    { "key": "42", "value": "beta",  "accessCount": "4" }
  ],
  "bplusLeaves": [
    {
      "id": "1",
      "entries": [
        { "key": "5",  "value": "gamma", "accessCount": "1" },
        { "key": "20", "value": "delta", "accessCount": "2" }
      ]
    }
  ]
}
```

---

## 9. Project Advantages vs Alternatives

### vs. Using Only a Hash Table

| Criterion | Adaptive Indexing Engine | Hash Table |
|---|---|---|
| Worst-case lookup | O(log n) guaranteed | O(n) with collisions |
| Ordered data | YES — sorted keys | NO |
| Range queries | YES — via B+ leaf chain | NO |
| Adaptability | YES — auto-promotion | NO |
| Visualization | Meaningful tree | Bucket array only |
| Memory layout | Predictable | Depends on hash function |

### vs. Using Only a BST (Unbalanced)

| Criterion | AVL (this project) | Plain BST |
|---|---|---|
| Worst-case height | O(log n) | O(n) — degrades to linked list |
| Sorted insert (1,2,3,…) | Stays balanced | Becomes linear chain |
| Guaranteed search time | O(log n) | O(n) worst |

### vs. Using Only a B+ Tree

| Criterion | Hybrid (this project) | B+ Tree Only |
|---|---|---|
| Hot key lookup | O(log n) — AVL fast path | O(n/k) — scan through leaves |
| Adaptation to workload | YES | NO |
| Cold vs hot awareness | YES | NO |
| Cache-friendly hot keys | In-memory AVL | Flat leaf array |

### vs. Using a Red-Black Tree Instead of AVL

| Criterion | AVL Tree | Red-Black Tree |
|---|---|---|
| Balance strictness | Stricter (\|Δ\| ≤ 1) | Looser |
| Search speed | Faster (shorter) | Slightly slower |
| Rotation count (insert) | Up to 2 | Up to 3 |
| Academic explainability | Simple balance factor | Color rules (complex) |

**Verdict:** For a **read-heavy hot cache**, AVL is the better choice. For a
**write-heavy log**, Red-Black would be preferred.

### vs. Existing Systems

| System | How it compares |
|---|---|
| Redis | In-memory only; no automatic promotion from disk; no B+ tree |
| SQLite | B-tree for indexing, no adaptive layer; no access-count migration |
| LevelDB / RocksDB | LSM-tree (log-structured merge); no AVL cache layer |
| This project | Hybrid adaptive; educationally transparent; fully visualized |

---

## 10. Folder Structure

```
adaptive-indexing-engine/
│
├── CMakeLists.txt              # CMake build configuration (C++17)
├── main.cpp                    # HTTP server, route handlers, JSON serialization
├── DOCUMENTATION.md            # This file
│
├── include/
│   ├── avl.h                   # AVL Tree class declaration + Node struct
│   ├── bplustree.h             # B+ Tree class declaration + LeafNode struct
│   ├── engine.h                # AdaptiveIndexingEngine declaration
│   └── crow/
│       └── crow_all.h          # Minimal single-header HTTP server
│
├── src/
│   ├── avl.cpp                 # AVL Tree: insert, search, rotations, snapshot
│   ├── bplustree.cpp           # B+ Tree: insert, search, remove, split, snapshot
│   └── engine.cpp              # Engine: insert routing, search + promotion logic
│
├── frontend/
│   ├── index.html              # Single-page app layout, 4 tab sections
│   ├── style.css               # Light academic theme, event-based animations only
│   └── app.js                  # Tab switching, fetch calls, SVG rendering, blink
│
└── build/
    └── Debug/
        └── adaptive-indexing-engine.exe   # Compiled server binary
```

---

## 11. Build & Run Instructions

### Prerequisites

- Windows 10/11 with Visual Studio Build Tools (MSVC)
- CMake ≥ 3.20
- A modern browser (Chrome, Firefox, Edge)

### Build

```bash
# Configure
cmake -S . -B build

# Compile
cmake --build build --config Debug
```

### Run the Server

```bash
./build/Debug/adaptive-indexing-engine.exe
# Output: [crow] Adaptive Indexing Engine running on http://localhost:18080
```

### Open the Dashboard

Open `frontend/index.html` directly in a browser, **or** serve it via a local
HTTP server for guaranteed CORS compatibility:

```bash
# Python (simple local server)
cd frontend
python -m http.server 3000
# Then visit http://localhost:3000
```

### Quick Test via curl

```bash
# Insert
curl "http://localhost:18080/insert?key=10&value=hello"

# Search (repeat 4 times to trigger promotion)
curl "http://localhost:18080/search?q=10"
curl "http://localhost:18080/search?q=10"
curl "http://localhost:18080/search?q=10"
curl "http://localhost:18080/search?q=10"
# 4th search: key 10 is promoted to AVL Tree

# Stats
curl "http://localhost:18080/stats"
```

---

## 12. Examiner Q&A — Anticipated Questions

**Q1. Why did you use AVL Tree instead of a simple array for the cache?**

An array gives O(1) index access but O(n) search by key. The AVL Tree gives
O(log n) search regardless of key distribution, and keeps data sorted for
potential range queries. For a key-value cache where keys are arbitrary integers,
AVL is far more efficient.

**Q2. What is the balance factor and how is it maintained?**

Balance factor (Δ) = height(left subtree) − height(right subtree). After every
insert, heights are updated bottom-up and the balance factor is recomputed. If
|Δ| > 1 at any node, one of four rotations (LL, RR, LR, RL) is applied to
restore balance. This ensures no path in the tree is more than 1.44·log₂(n) long.

**Q3. Why is the B+ Tree "leaf-only"?**

For educational clarity and focused scope. A full B+ Tree with internal separator
nodes would add significant complexity (parent pointers, separator key merging,
borrow/merge on deletion) without changing the core algorithm being demonstrated —
the adaptive promotion mechanism. The leaf-linked-list already demonstrates the
key B+ Tree properties: sorted storage, linked sequential access, and split-on-overflow.

**Q4. What happens when the same key is inserted twice?**

In `avl.cpp` (line 65-68): if key already exists, the value is updated and the
access count is preserved (`std::max`). In `bplustree.cpp` (line 22-25): if key
already exists in the leaf, only the value is updated (access count unchanged).
Duplicate keys are handled gracefully — no duplicate nodes are created.

**Q5. What is the space complexity of the entire engine?**

O(n) where n is the total number of unique keys. Each key exists in exactly one
structure (either AVL or B+ Tree) at any given time. The promotion moves the key
rather than copying it.

**Q6. Why does the dashboard poll /stats every 1 second?**

The server is single-threaded. Polling gives near-real-time updates without
persistent connections (WebSockets) while keeping the server implementation simple.
The trade-off is a maximum 1-second display lag after an operation.

**Q7. How does the frontend know which AVL node to blink after a search?**

A JavaScript variable `_blinkKey` is set to the searched key before `fetchStats()`
is called. Inside `drawNodes()`, when the matching node's `<g>` SVG element is
created, an inline CSS animation (`avlBlink`) is applied directly to the element
before it is appended to the DOM. This guarantees the animation fires reliably
without any timing or reflow issues.

**Q8. What would you improve with more time?**

1. Add internal nodes to the B+ Tree for O(log n) search
2. Implement LRU/LFU eviction from the AVL cache when it exceeds a size limit
3. Add a write-ahead log for persistence across server restarts
4. Support range query endpoint (`/range?lo=&hi=`)
5. Multi-threading with reader-writer locks for concurrent access

---

*Document prepared for Advanced Data Structures — Semester 4 examination.*
*All code is original, written in C++17 and Vanilla JavaScript.*
