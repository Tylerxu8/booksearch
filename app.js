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
  	const li = document.createElement("li");
  	li.textContent = doc.title;
  	results.appendChild(li);
  }
});

console.log({ form, input, results });