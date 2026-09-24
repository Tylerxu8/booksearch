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

export function addToShelf(shelf, book, savedAt) {
  if (shelf.some((b) => b.key === book.key)) return shelf;
  return [...shelf, { ...book, status: "want", savedAt }];
}

export function removeFromShelf(shelf, key) {
  return shelf.filter((b) => b.key !== key);
}

export function toggleRead(shelf, key) {
  return shelf.map((b) =>
  	b.key === key ? { ...b, status: b.status === "read" ? "want" : "read" } : b
  );
}

export function isOnShelf(shelf, key) {
  return shelf.some((b) => b.key === key);
}