# Adaptive Indexing Engine

In-memory **adaptive indexing** demo: new keys go into a simplified **B+ tree** (linked leaves). Each search bumps an access counter; when a key is searched often enough, it is **promoted** into an **AVL tree** for faster hot-key lookups.

The dashboard (`frontend/`) visualizes both structures, live stats, and configurable **B+ leaf capacity** (when leaves split).

---

## Requirements

| Item | Notes |
|------|--------|
| **CMake** | 3.20 or newer (`CMakeLists.txt`) |
| **C++ compiler** | C++17 (e.g. MSVC with *Desktop development with C++*, or MinGW) |
| **Crow** | Vendored in `include/crow/crow_all.h` (minimal HTTP server for Windows). No separate Crow install. |
| **Frontend (optional)** | Any static file server; examples below use **Python 3**. |

---

## Project layout

```
adaptive-indexing-engine/
├── include/          # Headers: AVL, B+ tree, engine, Crow
├── src/              # AVL, B+ tree, engine implementations
├── frontend/         # Static UI (HTML, CSS, JS) — talks to localhost:18080
├── CMakeLists.txt
├── main.cpp          # HTTP routes and server startup
└── README.md
```

---

## Build

From the repository root (`adaptive-indexing-engine/`):

**Windows (PowerShell)**

```powershell
mkdir build -ErrorAction SilentlyContinue
Set-Location build
cmake ..
cmake --build . --config Debug
```

**Generic (single-config generators, e.g. Ninja)**

```sh
mkdir -p build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Debug
cmake --build .
```

The executable is named **`adaptive-indexing-engine`** (`.exe` on Windows). With **Visual Studio** generators, it is often under a config folder, for example:

- `build/Debug/adaptive-indexing-engine.exe`
- `build/x64/Debug/adaptive-indexing-engine.exe`

If the linker reports that the `.exe` cannot be written, **stop the running server** and build again.

---

## Run the backend

Default URL: **`http://127.0.0.1:18080`** (see `main.cpp`).

From your `build` directory (adjust path if your generator outputs elsewhere):

```powershell
.\adaptive-indexing-engine.exe
```

or:

```powershell
.\Debug\adaptive-indexing-engine.exe
```

You should see a line similar to: `Adaptive Indexing Engine running on http://localhost:18080`.

Keep this terminal open while using the UI or API.

---

## Run the frontend

The UI is static HTML and expects the API at **`http://localhost:18080`** (see `frontend/app.js`).

Use a **different port** than 18080 so it does not clash with the API.

**Example (Python 3)**

```powershell
Set-Location frontend
python -m http.server 8080
```

Then open **`http://localhost:8080`** in a browser.

**Order:** start the **backend first**, then the **frontend**.

---

## Quick checks

- **API up:** open `http://localhost:18080/` — plain JSON status.
- **UI:** with both servers running, use **Insert** / **Search** and the **Statistics** tab; the page polls **`GET /stats`** about once per second.

---

## HTTP API

All successful JSON responses use string values for integer fields (Crow `wvalue` serialization).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health / status JSON. |
| `GET` | `/insert?key=INT&value=STRING` | Insert or update a key. Response includes `location` (`AVL Tree` or `B+ Tree`) and `accessCount`. |
| `GET` | `/search?q=INT` | Search by key. Increments B+ access count when found there; may promote to AVL. `404` if missing. |
| `GET` | `/stats` | Counters, `bplusLeafCapacity`, `avlNodes`, `bplusLeaves` (snapshots for the dashboard). |
| `GET` | `/config?bplusLeafCapacity=N` | Set B+ **split threshold**; when a leaf reaches `N` keys it splits. `N` must be **2-256**. **Clears all AVL and B+ data** and resets search/promotion counters. |

`OPTIONS` is supported where needed for CORS preflight.

### `GET /stats` (summary)

- `avlNodeCount`, `bplusNodeCount`, `totalSearches`, `promotions`, `bplusLeafCapacity` — stringified integers  
- `avlNodes` — list of `{ key, value, accessCount }`  
- `bplusLeaves` — list of leaves `{ id, entries: [{ key, value, accessCount }, ...] }`

### B+ split threshold

- **`bplusLeafCapacity = N`** means a leaf splits as soon as it reaches **N** keys.  
- Example: **N = 5** means the **5th** key inserted into that leaf triggers a split.

---

## Dashboard notes

- **B+ threshold** slider (sidebar): changing the value and releasing applies **`/config`** and clears all data (same as API).
- **Promotion threshold** slider: controls **UI hints** (e.g. progress toward promotion). Server-side promotion still uses the default compiled into `AdaptiveIndexingEngine` (typically **3** searches) unless you change the C++ constructor in `main.cpp`.

---

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| Port **18080** in use | Change `app.port(...)` in `main.cpp` and rebuild; update `API` in `frontend/app.js` to match. |
| Build cannot overwrite **.exe** | Stop `adaptive-indexing-engine.exe`, then rebuild. |
| UI shows offline | Confirm backend is running and browser can reach `http://localhost:18080/stats`. |

---

## License / course use

Use and modify as needed for coursework or demos; there is no separate license file in this tree.
