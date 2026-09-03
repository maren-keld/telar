/** Filtra el índice del blog por ?cat= o ?tag=. */
(function filterBlog() {
  const params = new URLSearchParams(location.search);
  const cat = (params.get("cat") || "").trim().toLowerCase();
  const tag = (params.get("tag") || "").trim().toLowerCase();
  const grid = document.querySelector("[data-article-grid]");
  if (!grid) return;

  const cards = [...grid.querySelectorAll(".article-card")];
  cards.forEach((card) => {
    const cats = (card.dataset.cat || "").toLowerCase().split(/\s+/);
    const tags = (card.dataset.tags || "").toLowerCase().split(/\s+/);
    const ok = (!cat && !tag) || (cat && cats.includes(cat)) || (tag && tags.includes(tag));
    card.hidden = !ok;
  });

  const visible = cards.filter((card) => !card.hidden).length;
  grid.classList.toggle("is-empty", visible === 0);

  document.querySelectorAll("[data-article-filter]").forEach((link) => {
    const href = new URL(link.href, location.href);
    const linkCat = (href.searchParams.get("cat") || "").toLowerCase();
    const linkTag = (href.searchParams.get("tag") || "").toLowerCase();
    const all = href.searchParams.toString() === "";
    link.classList.toggle("is-active", all ? !cat && !tag : linkCat === cat && linkTag === tag);
  });
})();
