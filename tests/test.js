import assert from "node:assert/strict";
import { normalizeBook, normalizeSubjectWork, addToShelf, removeFromShelf, toggleRead, isOnShelf } from "../books.js";

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log("ok -", name); }

test("normalizeBook fills in defaults for missing fields", () => {
  const out = normalizeBook({ key: "/works/1", title: "Some Book" });
  assert.equal(out.author, "Unknown author");
  assert.equal(out.year, null);
  assert.equal(out.coverId, null);
  assert.equal(out.editionKey, null);
});

test("normalizeBook keeps real fields when present", () => {
  const out = normalizeBook({
    key: "/works/1", title: "Dune", author_name: ["Frank Herbert"],
    first_publish_year: 1965, cover_i: 12345, cover_edition_key: "OL1M",
  });
  assert.equal(out.author, "Frank Herbert");
  assert.equal(out.year, 1965);
  assert.equal(out.coverId, 12345);
  assert.equal(out.editionKey, "OL1M");
});

test("normalizeSubjectWork fills in defaults for missing fields", () => {
  const out = normalizeSubjectWork({ key: "/works/1", title: "Some Book" });
  assert.equal(out.author, "Unknown author");
  assert.equal(out.year, null);
  assert.equal(out.coverId, null);
  assert.equal(out.editionKey, null);
});

test("normalizeSubjectWork keeps real fields when present", () => {
  const out = normalizeSubjectWork({
    key: "/works/1", title: "Dune", authors: [{ name: "Frank Herbert", key: "/authors/1" }],
    first_publish_year: 1965, cover_id: 12345, cover_edition_key: "OL1M",
  });
  assert.equal(out.author, "Frank Herbert");
  assert.equal(out.year, 1965);
  assert.equal(out.coverId, 12345);
  assert.equal(out.editionKey, "OL1M");
});

test("addToShelf adds a new book with status 'want'", () => {
  const out = addToShelf([], { key: "/works/1", title: "Dune" }, 1000);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, "want");
});

test("addToShelf does not add a duplicate key", () => {
  const start = [{ key: "/works/1", title: "Dune", status: "want", savedAt: 1 }];
  const out = addToShelf(start, { key: "/works/1", title: "Dune" }, 2000);
  assert.equal(out.length, 1);
});

test("removeFromShelf drops the matching key", () => {
  const start = [{ key: "/works/1" }, { key: "/works/2" }];
  const out = removeFromShelf(start, "/works/1");
  assert.deepEqual(out.map((b) => b.key), ["/works/2"]);
});

test("toggleRead flips status for the matching key only", () => {
  const start = [
    { key: "/works/1", status: "want" },
    { key: "/works/2", status: "want" },
  ];
  const out = toggleRead(start, "/works/1");
  assert.equal(out[0].status, "read");
  assert.equal(out[1].status, "want");
});

test("isOnShelf reports whether a key is present", () => {
  const shelf = [{ key: "/works/1" }];
  assert.equal(isOnShelf(shelf, "/works/1"), true);
  assert.equal(isOnShelf(shelf, "/works/999"), false);
});

console.log(`\n${passed} passed`);