const form = document.querySelector("#search-form");
const input = document.querySelector("#search-input");
const results = document.querySelector("#results");

const API_URL = "https://openlibrary.org/search.json";

function searchUrl(query) {
  return `${API_URL}?q=${encodeURIComponent(query)}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = input.value.trim();
  if (query === "") return;

  const response = await fetch(searchUrl(query));
  const data = await response.json();

  results.innerHTML = "";
  for (const doc of data.docs) {
  	const card = document.createElement("li");
  	card.className = "card";

  	const img = document.createElement("img");
  	img.alt = "";
  	img.src = doc.cover_i
  	  ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
  	  : "placeholder.png";
  	img.onerror = () => { img.src = "placeholder.png"; };

  	const title = document.createElement("h3");
  	title.textContent = doc.title;

  	const author = document.createElement("p");
  	author.textContent = doc.author_name ? doc.author_name[0] : "Unkown author";

  	const addBtn = document.createElement("button");
  	addBtn.type = "button";
  	addBtn.className = "add-too-shelf";
  	addBtn.dataset.key = doc.key;
  	addBtn.textContent = "Add to shelf";

  	card.append(img, title, author, addBtn);
  	results.appendChild(card);
  }
});

results.addEventListener("click", (event) => {
  if (!event.target.matches(".add-too-shelf")) return;

  const key = event.target.dataset.key;
  const li = document.createElement("li");
  li.textContent = `Added: ${key}`;
  document.querySelector("#shelf").appendChild(li);
});

console.log({ form, input, results });