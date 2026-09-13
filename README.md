# Book Search

A small book search + reading shelf. Search [Open Library](https://openlibrary.org/)
for books, save the ones you want to read, mark them read.

Built one day at a time following the course at
[Tylerxu8/booksearch-track](https://github.com/Tylerxu8/booksearch-track) — that repo
has the day-by-day lessons, the journal, and a practice copy with a planted bug. This
repo is just the app.

## Run it locally

```
python3 -m http.server 8000
```

Open <http://localhost:8000>. (A local server is required — the app uses ES modules,
which browsers refuse to load from a `file://` path.)

## Test

```
node tests/test.js
```

## Stack

Plain HTML, CSS, and JavaScript. No framework, no build step, no dependencies beyond
Node's built-in test assertions.
