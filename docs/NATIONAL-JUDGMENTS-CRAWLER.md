# National Judicial Decisions crawler

The scheduled workflow discovers publicly linked judgment pages from the official portal's homepage and same-origin sitemap declarations. It only follows canonical `/Judge/Text/{numeric-id}` links; it does not enumerate guessed IDs.

## Operation
- Daily scheduled run; manual dispatch accepts 1–1500 pages (type `CRAWL_PUBLIC_JUDGMENTS`).
- Reads `robots.txt` before crawling and stops when the source denies access or returns 401/403/429.
- One request every two seconds by default; only HTTPS and same-origin URLs are followed.
- No login, CAPTCHA bypass, hidden API probing, or access-control circumvention.
- D1 import is idempotent by source ID and slug. Full judgment text is stored as one `legal_articles` record; metadata is also indexed in `legal_document_index`.
- Every imported record and article remains `needs_review`. Type and issuing authority are provisional.
- The crawler stores a cursor in `legal_document_sources.last_cursor`, rechecks the newest 50 discovered records on each run, and resumes bulk discovery from the last successful record.
- A JSON audit artifact reports discovered, imported, failed, remaining estimate, and cursor.

## Scope and limitations
This adapter currently targets the National Judicial Decisions portal only. It uses official public links and sitemap entries when provided. If the portal exposes additional pages only through JavaScript actions that are not represented as links or sitemap entries, those pages are not guessed or scraped; a source-supported public pagination adapter must be added after its behavior is confirmed. The other official repositories (advisory opinions, circulars, Official Gazette and national regulations) require separate adapters and are not covered by this workflow.

## Required GitHub secrets
- `CLOUDFLARE_API_TOKEN` with D1 write access for `wefagh-db`.
- `CLOUDFLARE_ACCOUNT_ID`.

## Manual test
```bash
python -m pip install requests
python scripts/crawl_national_judgments.py --max-pages 5 --delay 2 --dry-run
```
