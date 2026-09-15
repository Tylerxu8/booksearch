import { normalizeBook, addToShelf, removeFromShelf, toggleRead, isOnShelf } from "./books.js";

const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const resultsEl = document.querySelector("#results");
const shelfEl = document.querySelector("#shelf");
const status = document.querySelector("#status");
const loadMoreBtn = document.querySelector("#load-more");

const API_URL = "https://openlibrary.org/search.json";

let page = 1;
let lastQuery = "";
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

function searchUrl(query, page) {
  return `${API_URL}?q=${encodeURIComponent(query)}&page=${page}`;
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

async function runSearch(query, { append = false } = {}) {
  if (query === "") {
  	results = [];
  	renderResults();
  	status.textContent = "";
  	loadMoreBtn.hidden = true;
  	return;
  }

  if (!append) {
  	page = 1;
  	lastQuery = query;
  }

  status.textContent = "Searching…";

  try {
  	const response = await fetch(searchUrl(query, page));
  	if (!response.ok) throw new Error(`request failed with status ${response.status}`);

  	const data = await response.json();
  	const newBooks = data.docs.map(normalizeBook);
  	results = append ? [...results, ...newBooks] : newBooks;
  	renderResults();

  	loadMoreBtn.hidden = results.length >= data.numFound;
  	status.textContent = results.length === 0 ? `No books found for "${query}".` : "";
  } catch (error) {
  	console.error(error);
  	if (!append) results = [];
  	renderResults();
  	status.textContent = "Something went wrong. Try again.";
  }
}

loadMoreBtn.addEventListener("click", () => {
  page += 1;
  runSearch(lastQuery, { append: true });
});

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