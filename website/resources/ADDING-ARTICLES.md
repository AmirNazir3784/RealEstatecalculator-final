# Adding a future article to Resources

Articles live as standalone pages under `/resources/`, styled by the single
shared stylesheet `website/assets/resources.css` (hub and articles). Do not
add per-article CSS or JS.

## Steps

1. **Create the page.** Copy an existing article folder (for example
   `resources/mortgage-payments/`) to `resources/<new-slug>/` and replace the
   content. Keep the shared header, mega menu, footer and script tags exactly
   as they are (paths are `../../assets/…` at this depth), and keep the
   title, lede, table of contents, article body,
   calculator CTA, references and "Keep reading" sections. Start the article
   with its H1; do not add breadcrumbs, a category badge or a reading-time
   row above it. The shared stylesheet sets the article's top spacing.
2. **Set the SEO fields.** Unique `<title>` and meta description, and the
   canonical `https://everyrealestatecalculator.com/resources/<new-slug>/`.
   Exactly one `<h1>`. No publication date is shown unless a real one exists.
3. **Add the hub card.** In `resources/index.html`, add one `.article-card`
   to `.article-grid` in the same structure as the existing cards: category
   chip, title, a 25–40 word description, reading time, and the single
   "Read article" link (the stretched link makes the whole card clickable —
   never put a second link inside a card). If the guide genuinely has a
   verified publication date, add it in the card's top row as
   `<span class="card-date"><svg …calendar icon…></svg> Month D, YYYY</span>`;
   otherwise omit it — never invent a date.
4. **Reading time.** Count the words in the article body and divide by 200
   (round to the nearest minute, minimum 1). Show "X min read" only on the
   hub card. Category badges also belong on cards, not above article headings.
5. **Sitemap.** Add one `<url>` entry to `website/sitemap.xml` and update the
   URL counts pinned in `tests/w7.cjs` and `tests/w9-resources.cjs`.
6. **Verify.** Run every suite in `website/tests/` (`h1`, `resources`, `w2`,
   `w4`, `w5a`, `w6`, `w7`, `w8`, `w9`, `w9-resources`, `commission`) and the packaging check
   (`node website/scripts/package-deploy.mjs`). Note that packaging rejects
   inline `<script>` blocks and inline event handlers, so structured data
   must not be pasted into the page as an inline script.

## Card categories

Use the directory's groupings: Mortgage, Buying, Investing, Selling, Tax,
For agents — or a short topic label in the same style.
