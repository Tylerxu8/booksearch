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

const API_URL = "https://openlibrary.org/search.json";
const routes = ["/", "/search", "/shelf"];
const GENRES = [
  { key: "fiction", label: "Fiction" },
  { key: "fantasy", label: "Fantasy" },
  { key: "mystery", label: "Mystery" },
];

let page = 1;
let lastQuery = "";
let results = [];
let shelf = [];
let debounceTimer = null;
let homeRows = [];
let shelfFilter = "all";
let toastTimer = null;

const savedShelf = localStorage.getItem("booksearch-shelf");
if (savedShelf) {
  try {
  	shelf = JSON.parse(savedShelf);
  } catch {
  	shelf = [];
  }
}
renderShelf();

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

function searchUrl(query, page) {
  return `${API_URL}?q=${encodeURIComponent(query)}&page=${page}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2500);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch(input.value.trim());
});

function renderResults() {
  resultsEl.innerHTML = "";
  for (const book of results) {
  	resultsEl.appendChild(buildBookCard(book));
  }
}

function buildBookCard(book) {
  const card = document.createElement("li");
  card.className = "card";

  const cover = document.createElement("div");
  cover.className = "card-cover";

  const img = document.createElement("img");
  img.alt = "";
  img.src = book.coverId
    ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`
    : "placeholder.png";
  img.onerror = () => { img.src = "placeholder.png"; };

  const saved = isOnShelf(shelf, book.key);
  const bookmarkBtn = document.createElement("button");
  bookmarkBtn.type = "button";
  bookmarkBtn.className = saved ? "bookmark-btn add-to-shelf saved" : "bookmark-btn add-to-shelf";
  bookmarkBtn.dataset.key = book.key;
  bookmarkBtn.disabled = saved;
  bookmarkBtn.setAttribute("aria-pressed", String(saved));
  bookmarkBtn.setAttribute("aria-label", saved ? "On shelf" : "Add to shelf");
  bookmarkBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';

  const info = document.createElement("div");
  info.className = "card-info";

  const title = document.createElement("h3");
  title.textContent = book.title;

  const author = document.createElement("p");
  author.textContent = book.author;

  info.append(title, author);
  cover.append(img, bookmarkBtn, info);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const buyLink = document.createElement("a");
  buyLink.href = book.editionKey
    ? `https://openlibrary.org/books/${book.editionKey}`
    : `https://openlibrary.org${book.key}`;
  buyLink.target = "_blank";
  buyLink.rel = "noopener noreferrer";
  buyLink.className = "buy-link";
  buyLink.textContent = "Buy";

  actions.append(buyLink);
  card.append(cover, actions);
  return card;
}

function renderHome() {
  const homeEl = document.querySelector("#home-rows");
  const scrollPositions = [...homeEl.querySelectorAll(".carousel")].map((el) => el.scrollLeft);
  homeEl.innerHTML = "";

  homeRows.forEach((row, i) => {
  	const section = document.createElement("div");
  	section.className = "row";

  	const header = document.createElement("div");
  	header.className = "row-header";

  	const heading = document.createElement("h2");
  	heading.textContent = row.label;

  	const nav = document.createElement("div");
  	nav.className = "row-nav";

  	const prevBtn = document.createElement("button");
  	prevBtn.type = "button";
  	prevBtn.className = "row-prev";
  	prevBtn.setAttribute("aria-label", "Scroll left");
  	prevBtn.textContent = "‹";

  	const nextBtn = document.createElement("button");
  	nextBtn.type = "button";
  	nextBtn.className = "row-next";
  	nextBtn.setAttribute("aria-label", "Scroll right");
  	nextBtn.textContent = "›";

  	nav.append(prevBtn, nextBtn);
  	header.append(heading, nav);

  	const list = document.createElement("ul");
  	list.className = "carousel";
  	for (const book of row.books) {
  	  list.appendChild(buildBookCard(book));
  	}

  	section.append(header, list);
  	homeEl.appendChild(section);
  });

  requestAnimationFrame(() => {
  	homeEl.querySelectorAll(".carousel").forEach((el, i) => {
  		el.scrollLeft = scrollPositions[i] || 0;
  	});
  });
}

function renderHomeSkeleton() {
  const homeEl = document.querySelector("#home-rows");
  homeEl.innerHTML = "";

  for (let i = 0; i < 4; i++) {
  	const section = document.createElement("div");
  	section.className = "row";

  	const heading = document.createElement("div");
  	heading.className = "skeleton skeleton-heading";

  	const list = document.createElement("ul");
  	list.className = "carousel";
  	for (let j = 0; j < 5; j++) {
  		const card = document.createElement("li");
  		card.className = "card skeleton-card";

  		const img = document.createElement("div");
  		img.className = "skeleton skeleton-img";

  		const line1 = document.createElement("div");
  		line1.className = "skeleton skeleton-line";

  		const line2 = document.createElement("div");
  		line2.className = "skeleton skeleton-line short";

  		card.append(img, line1, line2);
  		list.appendChild(card);
  	}

  	section.append(heading, list);
  	homeEl.appendChild(section);
  }
}

function renderShelf() {
  shelfEl.innerHTML = "";

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
  	li.dataset.key = book.key;

  	const cover = document.createElement("div");
  	cover.className = "card-cover";

  	const img = document.createElement("img");
  	img.alt = "";
  	img.src = book.coverId
  	  ? `https://covers.openlibrary.org/b/id/${book.coverId}-M.jpg`
  	  : "placeholder.png";
  	img.onerror = () => { img.src = "placeholder.png"; };

  	const info = document.createElement("div");
  	info.className = "card-info";

  	const title = document.createElement("h3");
  	title.textContent = book.title;

  	const author = document.createElement("p");
  	author.textContent = book.author;

  	info.append(title, author);
  	cover.append(img, info);

  	const actions = document.createElement("div");
  	actions.className = "card-actions";

  	const readBtn = document.createElement("button");
  	readBtn.type = "button";
  	readBtn.className = "toggle-read";
  	readBtn.textContent = book.status === "read" ? "Read" : "Mark read";

  	const removeBtn = document.createElement("button");
  	removeBtn.type = "button";
  	removeBtn.className = "remove";
  	removeBtn.textContent = "Remove";

  	const buyLink = document.createElement("a");
  	buyLink.href = book.editionKey
  	  ? `https://openlibrary.org/books/${book.editionKey}`
  	  : `https://openlibrary.org${book.key}`;
  	buyLink.target = "_blank";
  	buyLink.rel = "noopener noreferrer";
  	buyLink.className = "buy-link";
  	buyLink.textContent = "Buy";

  	actions.append(readBtn, removeBtn, buyLink);
  	li.append(cover, actions);
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
  	status.textContent = "Search for a book to get started.";
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

async function loadHome() {
  const statusEl = document.querySelector("#home-status");
  statusEl.textContent = "Loading…";
  renderHomeSkeleton();

  try {
  	const [trendingRes, ...genreResList] = await Promise.all([
  	fetch("https://openlibrary.org/trending/daily.json?limit=10"),
  	...GENRES.map((g) => fetch(`https://openlibrary.org/subjects/${g.key}.json?limit=10`)),
  ]);

  	const	trendingData = await trendingRes.json();
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

loadHome();

loadMoreBtn.addEventListener("click", () => {
  page += 1;
  runSearch(lastQuery, { append: true });
});

document.addEventListener("click", (event) => {
  if (!event.target.matches(".row-prev, .row-next")) return;
  const carousel = event.target.closest(".row")?.querySelector(".carousel");
  if (!carousel) return;

  if (event.target.matches(".row-prev")) carousel.scrollBy({ left: -400, behavior: "smooth" });
  if (event.target.matches(".row-next")) carousel.scrollBy({ left: 400, behavior: "smooth" });
});

document.addEventListener("click", (event) => {
  if (!event.target.matches(".add-to-shelf")) return;
  const	key = event.target.dataset.key;
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