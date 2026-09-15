const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const resultsEl = document.querySelector("#results");
const shelfEl = document.querySelector("#shelf");
const status = document.querySelector("#status");

const API_URL = "https://openlibrary.org/search.json";

let results = [];
let shelf = [];
let debounceTimer = null;

const savedShelf = localStorage.getItem("booksearch-shelf");
if (savedShelf) {
  try {
  	shelf = JSON.parse(savedShelf);
  } catch {
  	shelf = [];
  }
}
renderShelf();

function searchUrl(query) {
  return `${API_URL}?q=${encodeURIComponent(query)}`;
}

function normalizeBook(doc) {
  return {
  	key: doc.key,
  	title: doc.title || "Untitled",
  	author: doc.author_name ? doc.author_name[0] : "Unkown author",
  	year: doc.first_publish_year || null,
  	coverId: doc.cover_i || null,
  };
}

function addToShelf(shelf, book, savedAt) {
  if (shelf.some((b) => b.key === book.key)) return shelf;
  return [...shelf, { ...book, status: "want", savedAt }];
}

function removeFromShelf(shelf, key) {
  return shelf.filter((b) => b.key !== key);
}

function toggleRead(shelf, key) {
  return shelf.map((b) =>
  	b.key === key ? { ...b, status: b.status === "read" ? "want" : "read" } : b
  );
}

function isOnShelf(shelf, key) {
  return shelf.some((b) => b.key === key);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value.trim());
});

function renderResults() {
  resultsEl.innerHTML = "";
  for (const book of results) {
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

  	const addBtn = document.createElement("button");
  	addBtn.type = "button";
  	addBtn.className = "add-to-shelf";
  	addBtn.dataset.key = book.key;
  	addBtn.textContent = isOnShelf(shelf, book.key) ? "On shelf" : "Add to shelf";
  	addBtn.disabled = isOnShelf(shelf, book.key);

  	card.append(img, title, author, addBtn);
  	resultsEl.appendChild(card);
  }
}

function renderShelf() {
  shelfEl.innerHTML = "";
  for (const book of shelf) {
  	const li = document.createElement("li");

  	const status = document.createElement("input");
  	status.type = "checkbox";
  	status.checked = book.status === "read";

  	const title = document.createElement("span");
  	title.className = "title";
  	title.textContent = `${book.title} - ${book.author}`;

  	const removeBtn = document.createElement("button");
  	removeBtn.type = "button";
  	removeBtn.className = "remove";
  	removeBtn.textContent = "Remove";

  	li.dataset.key = book.key;
  	li.append(status, title, removeBtn);
  	shelfEl.appendChild(li);
  }
  saveShelf();
}

function saveShelf() {
  localStorage.setItem("booksearch-shelf", JSON.stringify(shelf));
}

async function runSearch(query) {
  if (query === "") {
  	results = [];
  	renderResults();
  	status.textContent = "";
  	return;
  }

  status.textContent = "Searching…";

  try {
  	const response = await fetch(searchUrl(query));
  	if (!response.ok) throw new Error(`request failed with status ${response.status}`);

  	const data = await response.json();
  	results = data.docs.map(normalizeBook);
  	renderResults();

  	status.textContent = results.length === 0
  	  ? `No books found for "${query}".`
  	  : "";
  } catch (error) {
  	console.error(error);
  	results = [];
  	renderResults();
  	status.textContent = "Something went wrong. Try again.";
  }
}

resultsEl.addEventListener("click", (event) => {
  if (!event.target.matches(".add-to-shelf")) return;
  const book = results.find((b) => b.key === event.target.dataset.key);
  shelf = addToShelf(shelf, book, Date.now());
  renderShelf();
  renderResults();
});

shelfEl.addEventListener("click", (event) => {
  const li = event.target.closest("li");
  if (!li) return;
  const key = li.dataset.key;

  if (event.target.matches('input[type="checkbox"]')) {
  	shelf = toggleRead(shelf, key);
  	renderShelf();
  }
  if (event.target.matches(".remove")) {
  	shelf = removeFromShelf(shelf, key);
  	renderShelf();
  	renderResults();
  }
});

input.addEventListener("input", (event) => {
  clearTimeout(debounceTimer);
  const query = event.target.value.trim();
  debounceTimer = setTimeout(() => runSearch(query), 300);
});

console.log({ form, input, results, shelf });