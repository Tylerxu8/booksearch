# NOTES — a walkthrough of the finished app

Written as a reading guide to the code you actually shipped, in the same spirit as
`todo-track`'s `docs/NOTES.md`. It goes file by file, in plain language, and defines
terms as they come up. If you reread one thing later, reread this alongside the file
it describes.

Everything here describes the real state of `index.html`, `styles.css`, `books.js`,
`app.js`, and `tests/test.js` — including the places where you went past what the
lessons asked for, and the post-course polish pass (bug fixes, the Buy button, toast
notifications, the search clear button, shelf filters) that came after the track
itself ended.

---

## 1. The shape of the app

Five files do all the work:

| File | Job |
|------|-----|
| `index.html` | The page's structure — the header, the three routed views (Home/Search/Shelf), the tab bar, the toast element. Contains no logic. |
| `styles.css` | Everything about how it looks, including the light/dark theme. Contains no logic. |
| `books.js` | The **pure logic** — small functions that take data in and hand new data back, touching nothing else. No knowledge of the page at all. This is the part `tests/test.js` checks. |
| `app.js` | The **wiring** — reads the page, fetches from Open Library, listens for clicks, calls the `books.js` functions, and redraws whatever changed. This is the only file that knows both about the page *and* about the data. |
| `tests/test.js` | Unit tests for `books.js`, run with plain Node — no framework, no browser. |

The one idea the whole app is built on: **the screen is a picture of your data.** You
never read a fact off the page to make a decision — you change the data (`results`,
`shelf`, `homeRows`, or `shelfFilter`), then call the matching `render...()` function,
and that function makes the page match the data again. Every event handler follows
the same shape: change the data → re-render → (often) persist to `localStorage`.

---

## 2. The data model

### A book (the shape everything downstream relies on)

```js
{ key: "/works/OL27448W", title: "Dune", author: "Frank Herbert", year: 1965, coverId: 12345, editionKey: "OL32848840M" }
```

- `key` — the Open Library work id, unique per book, never shown on screen. Plays the
  same role `todo-track`'s `task.id` does: code points at one exact book by `key`, not
  by title (two books can share a title).
- `title` / `author` — strings, with fallbacks (`"Untitled"` / `"Unknown author"`) for
  the fields Open Library sometimes omits.
- `year` — a number or `null`. Carried through but not currently shown anywhere.
- `coverId` — a number or `null`; used to build the cover image URL, or fall back to
  `placeholder.png` when there isn't one.
- `editionKey` — a number or `null`; the id of the *specific edition* whose cover is
  shown (as opposed to `key`, which identifies the *work* — every translation and
  edition of a book put together). Used to build the "Buy" link so it points at the
  exact edition you're looking at, not Open Library's aggregated work page (see 4.7).

**Two different Open Library response shapes get normalized into this one shape**,
which is why there are two normalizer functions in `books.js`:

- Search results and Trending: `author_name` (an array of strings), `cover_i`,
  `cover_edition_key`.
- Subject/genre endpoints: `authors` (an array of `{ name, key }` objects),
  `cover_id`, `cover_edition_key`.

Once normalized, nothing downstream (`buildBookCard`, the shelf, `isOnShelf`) ever has
to know or care which endpoint a book came from.

### A shelf entry

Same shape, plus two fields:

```js
{ ...book, status: "want" | "read", savedAt: 1699999999999 }
```

`status` drives the "On shelf" vs "Add to shelf" label, the disabled state on that
button, and the greyed-out card style once a book is marked read. `savedAt` is a
timestamp (`Date.now()`), stored but not currently displayed.

### The whole state (top of `app.js`)

```js
let page = 1;
let lastQuery = "";
let results = [];
let shelf = [];
let debounceTimer = null;
let homeRows = [];
let shelfFilter = "all";
let toastTimer = null;
```

- `results` — normalized books from the most recent search.
- `shelf` — normalized books the user saved, persisted to `localStorage` under the key
  `"booksearch-shelf"`.
- `homeRows` — built once by `loadHome()`: an array shaped
  `[{ label: "Trending", books: [...] }, { label: "Fiction", books: [...] }, ...]`.
- `page` / `lastQuery` — pagination state for the "Load more" button.
- `debounceTimer` — the timer id behind search-as-you-type.
- `shelfFilter` — `"all"`, `"want"`, or `"read"`; which subset of the shelf
  `renderShelf()` currently shows.
- `toastTimer` — the timer id behind the toast notification's auto-dismiss.

---

## 3. `books.js` — the pure functions

Same discipline as `todo-track`'s `todo.js`: every function here takes an array (or
object) in and returns a **brand new** one — nothing is mutated in place. That's what
makes them safe to unit test with no browser, and safe to call in sequence.

```js
export function normalizeBook(doc) {
  return {
    key: doc.key,
    title: doc.title || "Untitled",
    author: doc.author_name ? doc.author_name[0] : "Unknown author",
    year: doc.first_publish_year || null,
    coverId: doc.cover_i || null,
    editionKey: doc.cover_edition_key || null,
  };
}

export function normalizeSubjectWork(work) {
  return {
    key: work.key,
    title: work.title || "Untitled",
    author: work.authors && work.authors[0] ? work.authors[0].name : "Unknown author",
    year: work.first_publish_year || null,
    coverId: work.cover_id || null,
    editionKey: work.cover_edition_key || null,
  };
}
```

Two adapters, same output shape, different input field names — the concrete proof
that "normalize different API shapes into one internal shape" (the course's
`sidelines/working-with-remote-data.md` idea) holds across endpoints, not just across
missing fields within one endpoint. `doc.author_name ? doc.author_name[0] : ...` reads
"take the first author if the array exists, otherwise fall back"; `work.authors &&
work.authors[0] ? work.authors[0].name : ...` does the same one field deeper, since
`authors` holds objects, not plain strings. `editionKey` was added after the original
track — see 4.7 for why.

```js
export function addToShelf(shelf, book, savedAt) {
  if (shelf.some((b) => b.key === book.key)) return shelf;
  return [...shelf, { ...book, status: "want", savedAt }];
}
```

`.some` checks whether a book with this `key` is already on the shelf; if so, return
the shelf **unchanged** (no duplicates). Otherwise, spread the book's fields into a
new object with `status`/`savedAt` added, and append it.

```js
export function removeFromShelf(shelf, key) {
  return shelf.filter((b) => b.key !== key);
}
```

`.filter` keeps every book whose key does **not** match.

```js
export function toggleRead(shelf, key) {
  return shelf.map((b) =>
    b.key === key ? { ...b, status: b.status === "read" ? "want" : "read" } : b
  );
}
```

`.map` rebuilds the array; only the matching book gets a new object with `status`
flipped between `"want"` and `"read"`. Every other book passes through untouched.

```js
export function isOnShelf(shelf, key) {
  return shelf.some((b) => b.key === key);
}
```

Used in `buildBookCard` to decide a card's button label/disabled state, and
implicitly wherever "is this book already saved" matters.

---

## 4. `app.js` — the wiring, top to bottom

### 4.1 Imports and element handles (lines 1–11)

```js
import { normalizeBook, addToShelf, removeFromShelf, toggleRead, isOnShelf, normalizeSubjectWork } from "./books.js";

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const clearSearchBtn = document.querySelector("#clear-search");
const resultsEl = document.querySelector("#results");
const shelfEl = document.querySelector("#shelf");
const shelfFiltersEl = document.querySelector(".shelf-filters");
const status = document.querySelector("#status");
const loadMoreBtn = document.querySelector("#load-more");
const toastEl = document.querySelector("#toast");
```

Permanent handles onto elements that already exist in `index.html`, grabbed once and
reused everywhere — the same pattern as `todo-track`.

### 4.2 Constants and state (lines 13–28)

`API_URL`, `routes` (the three valid hash routes), `GENRES` (the three genre rows
Home fetches), then the `let` state variables described in section 2.

### 4.3 Load the shelf from storage (lines 30–38)

```js
const savedShelf = localStorage.getItem("booksearch-shelf");
if (savedShelf) {
  try {
    shelf = JSON.parse(savedShelf);
  } catch {
    shelf = [];
  }
}
renderShelf();
```

`try`/`catch` around `JSON.parse` means corrupted storage (a half-write, hand-edited
DevTools data) resets to an empty shelf instead of crashing the whole script — a blank
shelf beats a broken app. `renderShelf()` is called immediately so the Shelf tab is
correct even before you've navigated to it.

### 4.4 Routing (lines 40–59)

```js
function currentRoute() {
  const hash = window.location.hash.slice(1);
  return routes.includes(hash) ? hash : "/";
}

function showRoute() {
  const route = currentRoute();
  document.querySelectorAll("[data-route]").forEach((el) => {
    if (el.tagName === "SECTION") {
      el.hidden = el.dataset.route !== route;
    } else {
      el.classList.toggle("active", el.dataset.route === route);
      el.setAttribute("aria-current", el.dataset.route === route ? "page" : "false");
    }
  });
}

window.addEventListener("hashchange", showRoute);
showRoute();
```

`data-route` on both the three `<section>`s and the three tab `<a>` links is the
thread connecting a URL hash to the view it should show — one `querySelectorAll`
call handles both kinds of element, branching on `tagName` to apply the right
treatment (`hidden` for sections, `active`/`aria-current` for links). The trailing
`showRoute()` call, right after registering the listener, is not optional: landing
directly on a URL that already has a hash (e.g. `#/search`) fires no `hashchange`
event, since nothing *changed* — without this call the router would never run for
that first paint.

### 4.5 Search: URL building and the submit handler (lines 61–77)

`searchUrl(query, page)` builds the Open Library search URL with pagination baked in.
The form's `submit` listener prevents the browser's default reload-with-query-string
behavior and kicks off `runSearch`.

### 4.6 `showToast()` (lines 65–72)

```js
function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2500);
}
```

A small confirmation popup for actions whose effect might not be obvious at a glance
(a book added from deep in a scrolled carousel, say). `clearTimeout(toastTimer)` at
the top means calling `showToast` again before the first message has faded just
resets the clock and swaps the text — it doesn't stack up multiple toasts. The
`.show` class toggle pairs with a CSS `opacity`/`transform` transition (section 5),
so the actual show/hide animation lives in CSS, not JS.

### 4.7 `buildBookCard` — the shared card builder (lines 86–125)

```js
function buildBookCard(book) {
  const card = document.createElement("li");
  card.className = "card";

  const img = document.createElement("img");
  img.alt = "";
  img.src = book.coverId
    ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`
    : "placeholder.png";
  img.onerror = () => { img.src = "placeholder.png"; };

  const title = document.createElement("h3");
  title.textContent = book.title;

  const author = document.createElement("p");
  author.textContent = book.author;

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "add-to-shelf";
  addBtn.dataset.key = book.key;
  addBtn.textContent = isOnShelf(shelf, book.key) ? "On shelf" : "Add to shelf";
  addBtn.disabled = isOnShelf(shelf, book.key);

  const buyLink = document.createElement("a");
  buyLink.href = book.editionKey
    ? `https://openlibrary.org/books/${book.editionKey}`
    : `https://openlibrary.org${book.key}`;
  buyLink.target = "_blank";
  buyLink.rel = "noopener noreferrer";
  buyLink.className = "buy-link";
  buyLink.textContent = "Buy";

  actions.append(addBtn, buyLink);
  card.append(img, title, author, actions);
  return card;
}
```

Takes one `book`, returns one built `<li class="card">` — cover (with a `?:` fallback
for a missing `coverId` *and* an `onerror` fallback for a present-but-broken cover URL,
two different failure modes), title, author, and a `.card-actions` row holding two
buttons: "Add to shelf" (label/disabled state from `isOnShelf`) and "Buy."
`dataset.key = book.key` writes `data-key="..."` on the Add button — the invisible
thread the click listener (4.13) reads back to know which book was clicked.

**The Buy link** prefers `book.editionKey` — linking to
`https://openlibrary.org/books/{editionKey}`, the *exact edition* whose cover you're
looking at — over the fallback `https://openlibrary.org{book.key}` (the work page,
which aggregates every translation/edition of a book and can pick a non-English one
as its default). This came from a real bug: some books' Buy links were landing on a
Spanish edition. Not every book has a `cover_edition_key` from Open Library though
(roughly 1 in 8, checked against live data), so the fallback — and its
possibly-wrong-language behavior — is still reachable for that subset; see the
limitations at the end.

This one function is called from **four** places: `renderResults()`, `renderHome()`,
and `renderShelf()` all call it directly; `renderHomeSkeleton()` doesn't (it builds
fake placeholder cards instead) — so a book looks and behaves identically everywhere
it can appear.

### 4.8 `renderResults()` (lines 79–84)

Wipes `#results`, appends one `buildBookCard(book)` per book in `results`. The
simplest render function in the file — everything interesting lives in the shared
builder.

### 4.9 `renderHome()` and `renderHomeSkeleton()` (lines 127–205)

`renderHome()` rebuilds `#home-rows` from `homeRows`. For each row it builds a
heading, a `.carousel-wrap` containing a "previous" button, the `<ul class="carousel">`
of cards (via `buildBookCard`), and a "next" button.

The one non-obvious piece:

```js
const scrollPositions = [...homeEl.querySelectorAll(".carousel")].map((el) => el.scrollLeft);
homeEl.innerHTML = "";
homeRows.forEach((row, i) => { ... });

requestAnimationFrame(() => {
  homeEl.querySelectorAll(".carousel").forEach((el, i) => {
    el.scrollLeft = scrollPositions[i] || 0;
  });
});
```

`renderHome()` runs again every time the shelf changes (so "On shelf" state stays
correct on every card), which means it wipes and rebuilds every row — including
whichever row you'd scrolled through. Capturing each row's `scrollLeft` before
wiping, then reapplying it by index afterward, keeps your scroll position across a
re-render instead of snapping back to the start. It has to happen inside
`requestAnimationFrame` (deferred to the next paint) rather than immediately after
`appendChild` — setting `scrollLeft` on an element the instant it's inserted doesn't
reliably stick, because `.carousel` also uses `scroll-snap-type`, and the browser
doesn't finish resolving snap positions until layout has actually settled.

`renderHomeSkeleton()` builds 4 fake rows × 5 fake cards out of plain shimmering
`div`s (see `.skeleton` in section 5), shown immediately when `loadHome()` starts,
so the first paint is a recognizable loading shape instead of blank space or a bare
"Loading…" string.

### 4.10 `renderShelf()` and `saveShelf()` (lines 207–275)

```js
const visible = shelfFilter === "all"
  ? shelf
  : shelf.filter((book) => book.status === shelfFilter);

if (visible.length === 0) {
  const empty = document.createElement("li");
  empty.className = "empty-state";
  empty.textContent = shelf.length === 0
    ? "Your shelf is empty — search for a book to add one."
    : shelfFilter === "read"
      ? "No books marked as read yet."
      : "No books waiting to be read.";
  shelfEl.appendChild(empty);
}

for (const book of visible) {
  const li = document.createElement("li");
  li.className = "card";
  if (book.status === "read") li.classList.add("read");
  ...
}
```

`visible` is the actual `shelf` array narrowed to whatever `shelfFilter` currently is
— `renderShelf()` always builds from `visible`, never straight from `shelf`, so the
"All / Want to read / Read" chip buttons (4.13) just need to set `shelfFilter` and
call `renderShelf()` again. The empty-state message is filter-aware: an empty shelf
(`shelf.length === 0`) gets the original "search for a book" prompt, but filtering
an otherwise non-empty shelf down to zero visible books gets a message specific to
that filter instead — so "no books marked read yet" doesn't get confused with "you
haven't saved anything at all."

Each visible shelf entry renders as the same `.card` shape as Search/Home (cover,
title, author) rather than a plain text row, plus a `.card-actions` div holding
**three** buttons: `.toggle-read` (label flips between "Mark read" / "Read"),
`.remove`, and a Buy link built the same `editionKey`-first way as 4.7. A book with
`status === "read"` gets a `read` class added, which the CSS greys out and
grayscale-filters (section 5).

`saveShelf()` (`localStorage.setItem` + `JSON.stringify(shelf)` — note: the *whole*
`shelf` array, not the filtered `visible` one) is called at the end of every
`renderShelf()`, so every shelf change is persisted automatically regardless of which
filter happens to be active.

### 4.11 `runSearch()` (lines 277–310)

```js
async function runSearch(query, { append = false } = {}) {
  if (query === "") {
    results = [];
    renderResults();
    status.textContent = "Search for a book to get started.";
    loadMoreBtn.hidden = true;
    return;
  }
  ...
  status.textContent = "Searching…";
  try {
    const response = await fetch(searchUrl(query, page));
    if (!response.ok) throw new Error(`request failed with status ${response.status}`);
    ...
  } catch (error) {
    console.error(error);
    if (!append) results = [];
    renderResults();
    status.textContent = "Something went wrong. Try again.";
  }
}
```

The three-outcome shape: an early guard for an empty query (shows a friendly prompt
instead of leaving the page blank — this same message is also baked directly into
`index.html`'s `#status`, so it's there on first load even before this function ever
runs), a "Searching…" message set *before* the `await`, and a `try`/`catch` that
either shows real results (or a "no results" message) or a clear error — never a
silent failure. `{ append = false } = {}` is a **default parameter on a destructured
object**: called as `runSearch(query)`, `append` is `false`; called as
`runSearch(lastQuery, { append: true })` (from "Load more"), it's `true`, which
changes whether `page`/`lastQuery` get reset and whether new results replace or
extend the existing array.

### 4.12 `loadHome()` (lines 312–341)

```js
async function loadHome() {
  const statusEl = document.querySelector("#home-status");
  statusEl.textContent = "Loading…";
  renderHomeSkeleton();

  try {
    const [trendingRes, ...genreResList] = await Promise.all([
      fetch("https://openlibrary.org/trending/daily.json?limit=10"),
      ...GENRES.map((g) => fetch(`https://openlibrary.org/subjects/${g.key}.json?limit=10`)),
    ]);

    const trendingData = await trendingRes.json();
    const genreDataList = await Promise.all(genreResList.map((r) => r.json()));

    homeRows = [
      { label: "Trending", books: trendingData.works.map(normalizeBook) },
      ...GENRES.map((g, i) => ({
        label: g.label,
        books: genreDataList[i].works.map(normalizeSubjectWork),
      })),
    ];

    statusEl.textContent = "";
    renderHome();
  } catch (error) {
    console.error(error);
    statusEl.textContent = "Couldn't load books right now. Refresh to try again.";
    document.querySelector("#home-rows").innerHTML = "";
  }
}
```

One `Promise.all` starts all four requests (Trending + three genres) **concurrently**
— measurably faster than `await`ing them one at a time, per `sidelines/concurrent-
requests.md`. A **second** `Promise.all` parses all four response bodies
concurrently too, since `.json()` is itself asynchronous. `const [trendingRes,
...genreResList] = ...` destructures with a rest pattern: the first promise's result
goes to `trendingRes`, everything after gathers into `genreResList`. On success,
`homeRows` is built and `renderHome()` draws it; on failure, the status paragraph
gets an error message and `#home-rows` is explicitly cleared so the shimmering
skeleton doesn't sit there frozen forever.

### 4.13 Event listeners (lines 343–414)

```js
loadHome();

loadMoreBtn.addEventListener("click", () => {
  page += 1;
  runSearch(lastQuery, { append: true });
});

document.addEventListener("click", (event) => {
  const carousel = event.target.closest(".carousel-wrap")?.querySelector(".carousel");
  if (!carousel) return;
  if (event.target.matches(".row-prev")) carousel.scrollBy({ left: -400, behavior: "smooth" });
  if (event.target.matches(".row-next")) carousel.scrollBy({ left: 400, behavior: "smooth" });
});

document.addEventListener("click", (event) => {
  if (!event.target.matches(".add-to-shelf")) return;
  const key = event.target.dataset.key;
  const book =
    results.find((b) => b.key === key) ||
    homeRows.flatMap((row) => row.books).find((b) => b.key === key);
  if (!book) return;

  shelf = addToShelf(shelf, book, Date.now());
  renderShelf();
  renderResults();
  renderHome();
  showToast(`Added "${book.title}" to shelf`);
});

shelfEl.addEventListener("click", (event) => {
  const li = event.target.closest("li");
  if (!li) return;
  const key = li.dataset.key;

  if (event.target.matches(".toggle-read")) {
    shelf = toggleRead(shelf, key);
    renderShelf();
  }
  if (event.target.matches(".remove")) {
    const removed = shelf.find((b) => b.key === key);
    shelf = removeFromShelf(shelf, key);
    renderShelf();
    renderResults();
    renderHome();
    if (removed) showToast(`Removed "${removed.title}" from shelf`);
  }
});

shelfFiltersEl.addEventListener("click", (event) => {
  if (!event.target.matches(".filter-btn")) return;
  shelfFilter = event.target.dataset.filter;
  shelfFiltersEl.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === shelfFilter);
  });
  renderShelf();
});

input.addEventListener("input", (event) => {
  clearSearchBtn.hidden = event.target.value === "";
  clearTimeout(debounceTimer);
  const query = event.target.value.trim();
  debounceTimer = setTimeout(() => runSearch(query), 300);
});

clearSearchBtn.addEventListener("click", () => {
  input.value = "";
  clearSearchBtn.hidden = true;
  clearTimeout(debounceTimer);
  runSearch("");
  input.focus();
});
```

- `loadHome()` runs once, unconditionally, as soon as the script executes.
- The arrow-scroll listener is on `document`, not each button — **event delegation**,
  the same pattern `todo-track` uses. `.closest(".carousel-wrap")?.querySelector(...)`
  uses optional chaining (`?.`) so a click anywhere else on the page (where `closest`
  returns `null`) short-circuits instead of throwing.
- The "add to shelf" listener is *also* delegated on `document`, deliberately — not
  scoped to `#results` — so the same handler covers cards on both the Search and Home
  tabs. It looks the clicked book up in `results` first, falling back to
  `homeRows.flatMap((row) => row.books)` (flattening every row's books into one array)
  if it's not there. After adding, **all three** render functions run, so a book's
  "On shelf" state stays correct everywhere it can appear, not just wherever it was
  clicked from — and a toast confirms the action.
- The shelf listener's `.remove` branch grabs the book (for its title) *before*
  removing it — `removeFromShelf` only needs the `key`, but the toast needs the
  `title`, and once removed the book is gone from `shelf` to look up. It also calls
  `renderResults()` and `renderHome()` — removing a book has to re-enable its "Add to
  shelf" button wherever else that book's card is currently showing, the same
  reasoning as the add path above.
- `shelfFiltersEl`'s listener is delegated on the filter chip row's container. It
  sets `shelfFilter` from the clicked button's `data-filter`, toggles which button
  gets the `active` class (the same `classList.toggle(cond)` pattern used for tab
  links in `showRoute()`), then re-renders.
- The search input's `input` listener debounces (every keystroke cancels the pending
  timer and starts a new 300ms one, so `runSearch` only actually fires once typing
  pauses) *and* toggles `clearSearchBtn.hidden` based on whether the field is empty.
- `clearSearchBtn`'s own listener empties the input, hides itself again, cancels any
  pending debounce (so a stale search doesn't fire moments after clearing), resets
  to the empty-query state via `runSearch("")`, and returns focus to the input.

---

## 5. `styles.css` — the parts worth knowing

- **CSS custom properties for the whole theme** (`:root`, lines 3–11): `--bg`,
  `--text`, `--muted-text`, `--card-bg`, `--tab-bg`, `--border`, `--accent`. Every
  themed rule in the file reads one of these instead of a literal color.
  `@media (prefers-color-scheme: dark)` (lines 305–315) redefines all seven inside
  `:root` — that's the **entire** dark mode implementation. No rule anywhere
  duplicates its light-mode version for dark; the values just change underneath it.
- **The responsive card grid** (`#results`, `#shelf`, lines 53–92):
  `grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr))` — as many 9rem-or-
  wider columns as fit the container, no media query needed to reflow at different
  widths.
- **The search input's clear button** (`.input-wrap`, `#clear-search`, lines 29–51) —
  `.input-wrap` is `position: relative` so `#clear-search` can be `position:
  absolute`, pinned inside the input's right edge; `#search-input`'s own
  `padding-right: 2rem` leaves room so typed text never runs under the button.
- **The shelf filter chips** (`.shelf-filters`, `.filter-btn`, lines 62–83) — pill-
  shaped buttons (`border-radius: 999px`), visually distinct from the squared-off
  `.card-actions` buttons on purpose, so "these are view filters, not actions on a
  book" reads at a glance. `.filter-btn.active` swaps to the accent color, the same
  "active" signal `.tab.active` uses elsewhere.
- **`.card-actions`** (lines 132–151) is `flex-direction: column` — the action
  buttons stack vertically rather than sitting side by side, which is what makes room
  for a *third* button (Buy) on shelf cards without things getting cramped.
- **`.carousel`** (lines 159–172) — a horizontal scroll-snap row:
  `overflow-x: auto` lets it scroll sideways; `scroll-snap-type: x mandatory` +
  `scroll-snap-align: start` on each card makes scrolling (by trackpad, touch, or the
  arrow buttons) settle on a card boundary instead of stopping mid-card;
  `flex: 0 0 auto` on `.carousel .card` stops flex from shrinking cards to fit.
- **`.carousel-wrap` / `.row-prev` / `.row-next`** (lines 174–237) — the wrapper is
  `position: relative` so the two circular buttons can be `position: absolute`,
  pinned to its edges. They're `display: none` by default and only turn on inside
  `@media (hover: hover)` (a hover-capable pointer, i.e. a desktop mouse) — touch
  devices already scroll the carousel by swiping, so the buttons would just be
  clutter there.
- **`#tab-bar`** (lines 239–303) — `position: fixed` pins it to the viewport;
  `backdrop-filter: blur(20px)` blurs whatever scrolls underneath it, which only
  looks like anything because the background is semi-transparent
  (`var(--tab-bg)`, an `rgba(...)` value) rather than solid — an opaque background
  would hide the blur entirely. `env(safe-area-inset-bottom)` adds exactly enough
  padding to clear a phone's home indicator, and resolves to `0` (a no-op) on a
  regular desktop browser. `main { padding-bottom: 4.5rem }` keeps the last row of
  content from sitting behind the fixed bar. At `@media (min-width: 768px)`, the
  *same* `#tab-bar` becomes a `10rem`-wide fixed left sidebar instead of a bottom bar
  — restructured via different properties on the same rule, not a second, separate
  nav element. That same media query also removes `body`'s `max-width: 40rem` cap
  (which was otherwise squeezing all page content into a narrow column regardless of
  how wide the screen actually was) and shifts both `#app-bar` and `main` right by
  the sidebar's width so neither sits hidden underneath the fixed sidebar — a real
  bug early versions had, where the fixed sidebar visually painted over the page
  title since only `main`, not the header, was offset to clear it.
- **`.skeleton`** (lines 178–208) — a moving gradient
  (`background: linear-gradient(...)`, animated via `@keyframes skeleton-shimmer`
  shifting `background-position`) used for every placeholder shape
  (`.skeleton-heading`, `.skeleton-img`, `.skeleton-line`) in `renderHomeSkeleton()`.
- **`.card.read`** (lines 124–130) — `opacity: 0.55` on the whole card plus
  `filter: grayscale(70%)` on just its image — the "greyed out" treatment for a book
  marked read on the Shelf tab.
- **`#toast` / `#toast.show`** (lines 317–338) — `position: fixed`, centered
  horizontally (`left: 50%; transform: translate(-50%, ...)`), sitting above the
  bottom tab bar. At rest it's `opacity: 0` and `pointer-events: none` (invisible
  *and* unclickable, so it never blocks taps on whatever's underneath); adding the
  `.show` class (from `showToast()` in `app.js`) animates it to `opacity: 1` via a
  CSS `transition`, and the vertical `transform` shift gives it a small slide-up-into-
  place motion rather than a flat fade.

---

## 6. `tests/test.js` — what's checked and how

Run it:

```
node tests/test.js
```

A tiny `test(name, fn)` helper runs `fn`, counts it, and logs `ok - <name>`; a thrown
assertion halts the file and shows expected-vs-actual. 9 tests currently:

- `normalizeBook` — fills in defaults for a doc missing every optional field, and
  keeps the real values when they're present.
- `normalizeSubjectWork` — the same two cases, against the *other* input shape
  (`authors`/`cover_id` instead of `author_name`/`cover_i`).
- `addToShelf` — adds a new book with `status: "want"`, and refuses a duplicate key.
- `removeFromShelf` — drops only the matching key.
- `toggleRead` — flips `status` for the matching key only, leaving others untouched.
- `isOnShelf` — true for a present key, false for an absent one.

Nothing about the DOM, `fetch`, routing, or any `render...()` function is tested —
those all need a real browser. Only `books.js`'s pure logic is covered, which is the
whole reason it's split into its own file. (This means the newer UI-only features —
toasts, the shelf filter, the search clear button — have no automated test coverage;
they're exercised by hand.)

---

## 7. `index.html` — the hooks

No logic. It provides the elements the CSS and JS attach to:

- `<meta name="color-scheme" content="light dark">` — tells the browser this page
  supports both themes, so native UI (scrollbars, form controls) picks the right
  variant instead of guessing.
- `<meta name="description">`, the `og:*` tags, and `<meta name="twitter:card">` —
  so a shared link shows a real title/description preview instead of a bare URL.
  There's no `og:image` yet (no image asset or SVG→PNG tool was available to make
  one) — see the limitations below.
- `<link rel="icon" href="data:image/svg+xml,...">` — an inline SVG data URI (a
  book emoji), so the tab favicon needs no separate image file.
- Three `<section data-route="...">` elements inside `<main>` (Home, Search, Shelf),
  matched against the tab bar's `<a data-route="...">` links — the thread `showRoute()`
  reads.
- `#home-status` and `#home-rows` are **siblings**, not one nested inside the other —
  deliberately, so `renderHome()`/`renderHomeSkeleton()` wiping and rebuilding the
  rows container never destroys the loading/error message paragraph next to it. (An
  earlier version had the status paragraph *inside* the element `renderHome()` wiped,
  which silently deleted it from the DOM on first render — a real bug this structure
  fixes.)
- The search `<form>` wraps `#search-input` in a `.input-wrap` div alongside
  `#clear-search`, a `hidden`-by-default button — `app.js` toggles its visibility as
  you type (4.13).
- `#status` starts with real text already in the markup ("Search for a book to get
  started.") rather than empty, so the prompt shows immediately on first load, not
  only after `runSearch("")` has run once.
- The Shelf section has a `.shelf-filters` group of three buttons (`data-filter="all"
  /"want"/"read"`) above `#shelf` — the "All" one starts with `class="active"` baked
  in, matching `shelfFilter`'s default of `"all"`.
- `<div id="toast" role="status" aria-live="polite"></div>` sits as its own element,
  a sibling of `<nav>`, right before the closing `<script>` tag — outside all three
  routed `<section>`s, so it can float above whichever view is currently showing.
  `aria-live="polite"` means a screen reader announces its text when it changes,
  without interrupting whatever the user is doing.
- `<script type="module" src="app.js">` at the end of `<body>` — `type="module"`
  because `app.js` uses `import`/`export`; modules only run after the page has
  parsed, so no `defer` is needed. The app must be served over a real server (not
  opened as a `file://` path) for module imports to work — locally,
  `python3 -m http.server 8000`.

---

## 8. What you did beyond the lessons

Worth remembering these were your calls, not the script's:

1. **Scroll-position preservation on the Home carousels** — capturing and restoring
   each row's `scrollLeft` across a `renderHome()` re-render (including the
   `requestAnimationFrame` timing fix for `scroll-snap-type`). Not in the lessons; a
   real bug you noticed in testing ("it jumps back to the beginning") and we tracked
   down together.
2. **Arrow buttons hidden on touch devices** (`@media (hover: hover)`) — since swipe
   already works there, showing click targets too would just be clutter. The
   lessons mention this *category* of technique (`hover: hover` splitting desktop
   vs. touch chrome) but never apply it to the carousel buttons specifically.
3. **Split `#home-status` out from the rows it wipes** — fixing a structural bug
   where `renderHome()`'s `innerHTML = ""` was deleting the status paragraph from
   the DOM on every render.
4. **The Shelf tab's "remove" handler also re-renders Home** — the lesson's version
   of that listener only ever touched `renderShelf()`/`renderResults()`; removing a
   book without also calling `renderHome()` left a stale "On shelf" button showing
   on Home until a full reload.
5. **Skeleton loading placeholders for Home** (`renderHomeSkeleton()`, `.skeleton`)
   instead of a plain "Loading…" text line.
6. **Open Graph / meta description / favicon / `color-scheme`** — none of this is in
   the course material; all added for link-sharing and browser-chrome polish.
7. **Empty states** — a friendly prompt on Search before the first query, and a
   filter-aware "shelf is empty" / "no books waiting" / "no books read yet" message
   instead of a blank list.
8. **The Shelf tab redesigned as full cards** (cover, title, author, a multi-button
   action row) instead of the lesson's plain single-line checkbox/text/remove row,
   with a greyed-out treatment for books marked read.
9. **Extra test coverage** — `normalizeSubjectWork` had zero tests despite being
   added in `W03D2`; added the same two-case coverage `normalizeBook` already had.
10. **A "Buy" link on every card**, using the specific edition (`cover_edition_key`)
    rather than Open Library's aggregated work page, so it doesn't default to a
    translated edition — tracked down after noticing some books linked to a Spanish
    version.
11. **A real desktop layout pass** — removed a leftover mobile-first `max-width`
    that was leaving most of a wide screen empty, fixed the page title rendering
    invisibly underneath the fixed sidebar, and narrowed the sidebar itself so it
    isn't mostly dead space next to short tab labels.
12. **Toast notifications** for adding/removing shelf books, a search-box clear
    button, and shelf filter chips (All/Want to read/Read) — none of this is in the
    course material; all added as usability polish after the track ended.

---

## 9. Known limitations (still true)

- **No request cancellation on search.** Typing fast and hitting Enter before the
  300ms debounce fires can start two overlapping `fetch` calls; whichever response
  lands last wins, even if it's for a shorter/older query. Fixing this properly
  would need something like `AbortController`, not covered by the course yet.
- **The Buy link's fallback can still show the wrong language.** Books without a
  `cover_edition_key` (roughly 1 in 8, in practice) fall back to Open Library's work
  page, which is the exact page that can default to a non-English edition — the
  original bug, for that subset only.
- **A few colors are still hardcoded**, not routed through the theme's CSS
  variables: `.card p`'s author text (`color: #666`) and the `.card-actions
  button`/`.card-actions a` borders (`#ccc`) don't fully adapt in dark mode. The
  arrow buttons' background (`rgba(255, 255, 255, 0.85)`) is also a fixed light
  value regardless of theme.
- **No `og:image`.** Shared links get a text-only preview card, no thumbnail — this
  machine had no SVG→PNG conversion tool available to generate one.
- **No installability.** No `manifest.json` or icons, so there's no "Add to Home
  Screen" support yet.
- **No per-view page `<title>`.** The browser tab always reads "Book Search," even
  on the Search or Shelf views.
- **The shelf filter doesn't persist.** `shelfFilter` resets to `"all"` on every
  page load — unlike the shelf's contents, it isn't saved to `localStorage`.
- **Toast messages don't queue.** A second action within 2.5 seconds of the first
  replaces the visible message rather than showing both in sequence.
- **No offline/404 handling**, and no custom typography beyond the system font
  stack.
- **`localStorage` is per-browser, per-origin.** The shelf doesn't sync across
  devices or browsers — two people (or the same person on two devices) opening the
  deployed URL get two separate, private shelves. Same limitation `todo-track` has.
