# Local Ask source-PDF recovery

Completed 2026-10-21 on `evolved/asks-doubts`. This is a local recovery, not a hosted deployment.
Ask latency/model settings and grounding rules were not changed.

## Result

**497 of 498 source records now have locally downloadable PDFs:** 377 textbook chapter excerpts
and 120 past/model papers. One unresolved source remains an explicitly labeled OCR fallback.
The local-only `docs/ask-evolution/PDF_RECOVERY_CATALOG.csv` lists all 498 source IDs, curriculum
identities, old/current Storage paths, original/served hashes, page ranges, page counts and recovery
method. This recovery inventory is deliberately excluded from the feature commit, together with
the actual recovery data; it remains available in this workspace.

| Class | Recovered source records |
| --- | ---: |
| 9 | 107 |
| 10 | 125 |
| 11 | 141 |
| 12 | 124 |

Local Storage contains 509 PDF objects: 497 recovered source objects plus 12 retained original
objects whose reader-compatible copies are now linked. All objects are in the local public
`source-pdfs` bucket. This counts files/source records, not academic accuracy.

The app was rebuilt with the private local environment overlay and left running at
http://localhost:3100/doubts. The existing local account credentials remain only in ignored
`.recovery/ask-demo-login.json`. Docker Desktop and the existing `sabaq-ask-review` services were
started without resetting or deleting any container or volume. Original `.env.local` was preserved.

## Confirmed cause and inspected implementation

The local restore had 498 `chapter_sources` rows, of which 493 retained a `storage_path`, but the
local Storage service listed only the `avatars` bucket. **The `source-pdfs` bucket did not exist.**
An actual GET of the referenced Physics 10 chapter returned HTTP 400 with no PDF signature.
This was not an inference from absent links or a HEAD response.

`src/app/api/ask/options/route.ts` reads restored source paths and section pages. With the existing
local `SOURCE_PDF_BYTES_AVAILABLE=false` setting it lists local objects and probes their bytes
before offering URLs. That setting was kept: it enables availability checks, not a blanket ban
on PDFs. Missing files still produce `pdfUrl:null`.

`src/components/app/AskDocumentReader.tsx` chooses its canvas PDF.js reader when a URL exists,
otherwise its OCR text reader. A clicked citation is passed from `AskResultView` through the
Doubts page as `activeCitation`. The PDF reader converts the citation's book page to its local
chapter page using `citation.pageFrom - unit.pageFrom + 1`.

The repository already contained:

- 207 PDFs in `data/.pdf-cache/` (about 1.89GB), cached OCR and the crawl-state checksums/manifests.
- `scripts/backfill-pdf-storage.ts`, which uploads whole papers by year. It does not extract
  textbook chapters and is not suitable for blindly attaching whole books.
- Historical chapter ingestion scripts with saved original hashes/page boundaries. These also
  reset/reingest source rows, so **they were inspected, not executed**.
- `src/lib/storage/source-pdfs.ts` bucket/upload helpers and `crawler/pdf-rebuild.ts` for faithful
  raster-page rebuilding. Those existing helpers were reused for uploads and reader copies.

No prepared/recovery PDFs from the other laptops documented in the repository were present in
this checkout. The narrow local Temp PDF search found no additional originals. Earlier reports
of 498 restored files described those other machines, not this laptop.

## First chapter: complete HTTP/file path

Pilot: FBISE / Class 10 / Physics / textbook / chapter 2, **Thermal Expansion And Change Of State**.
Source ID: `3c4701fa-eea6-4b3a-8638-4aeb1331b4f3`.

1. The cached 364-page original has SHA-256
   `7e1ed09b9b0334e51163feaa63a3830042cf3ca2473ffacaeff4d5206514243d`, matching the saved
   crawl state, cached OCR identity and the existing Physics 10 ingestion script.
2. All 34 restored chapter chunks had an interior text anchor in the cached OCR within their
   stored section page ranges. No OCR or embedding request was run.
3. Original physical pages **45–74** were extracted as a **30-page** standalone PDF. Every
   extracted page's content stream, MediaBox, CropBox and rotation matched its corresponding
   original page. The original book was not linked with a chapter offset.
4. The chapter was uploaded to its existing local path
   `fbise/10/physics/textbook-2-en.pdf`; that source row needed no reference change.
5. Full public GET returned HTTP 200, `Content-Type: application/pdf`, valid `%PDF-` bytes and
   SHA-256 `9803116e1ef01374126aae7f8078f6d5054c9afb59a3221237ef0238a92994c9`, matching the
   prepared file. Its size is 5,394,564 bytes. A range GET returned HTTP 206 and
   `Content-Range: bytes 0-15/5394564`.
6. The actual options endpoint returned the local Storage URL and `pageFrom:45`.
   The saved real Ask citation points to book page **57**, so the reader target is **page 13**.
   The document endpoint still resolves that exact chunk ID, page and stored excerpt.
7. Original page 57 and recovered page 13 were rendered with Poppler and compared pixel by
   pixel: identical. The rendered page was visually inspected and contains the cited
   evaporation/cooling passage. The PDF worker endpoint returned HTTP 200.

Pilot URL (local services must be running):
http://127.0.0.1:54321/storage/v1/object/public/source-pdfs/fbise/10/physics/textbook-2-en.pdf

This establishes the HTTP, identity, file and page-mapping path. **It does not establish an actual
browser click:** the browser inventory was empty. The distinction applies to the bulk checks too.

## Remaining recovery and identity controls

### Textbooks

All 33 textbook originals were already cached and matched their saved SHA-256 checksums. Their
377 chapter excerpts were extracted from the restored section page ranges using an isolated
Python/pypdf environment under `.recovery/pdf-env/`. The exact original page count also had to
match the cached OCR page count. Restored chunk anchors were checked against the corresponding
cached OCR page ranges before extraction. All 377 passed. Extraction reopened and checked every
chapter's page count and original content-stream/geometry correspondence.

This path preserves original page content rather than regenerating pages from OCR. It was used
instead of rerunning ingestion or rendering every original book. The installed PDF parsing tools
are local recovery tooling, not new application dependencies.

### Papers and bundles

115 original paper files matched the exact scope/language/year manifest entries and saved crawl
checksums. Text/OCR anchors were used as corroboration. Exact paragraph matching was incomplete
for some formulas and right-to-left extraction; those cases were not described as full text
matches. The Class 11 Islamiyat model paper had no stable text anchors; its exact-checksum original
cover was rendered and visually checked for its class/subject identity before publication.
Existing chapter titles sometimes retain historical “Marking Scheme” labels on shared chapter
rows; those labels were not used to substitute marking-scheme PDFs and were not changed.

Five records originally had null paths because their subject pages came from larger 2024 bundles.
The matching originals were located through the official FBISE archive pages and downloaded:
[SSC-I](https://www.fbise.edu.pk/AllOldPapersSSC1_2024.php),
[SSC-II](https://www.fbise.edu.pk/AllOldPapersSSC2_2024.php), and
[HSSC-II](https://www.fbise.edu.pk/AllOldPapersHSSC2_2024.php).
All three downloads matched the original saved bundle checksums exactly. Only these saved,
subject-specific ranges were extracted, using cached rotation corrections without rerunning OCR:

| Class / subject / 2024 past paper | Bundle physical pages | Excerpt pages |
| --- | --- | ---: |
| 9 Pakistan Studies | 21–28 | 8 |
| 9 Islamiyat, New curriculum | 71–76 | 6 |
| 10 Pakistan Studies | 21–28 | 8 |
| 10 Islamiyat, New curriculum | 71–72 | 2 |
| 12 Pakistan Studies | 25–30 | 6 |

The ranges come from the actual prior extraction scripts, including their documented corrections
to avoid adjacent Physics papers and old-syllabus Islamiyat. Every restored chunk in each subject
had a text anchor in the selected rotation-corrected OCR. Sample first pages were rendered and
visually checked upright. The entire bundle was never attached as the subject PDF. These papers
have null stored citation pages; the recovery did not invent page metadata or promise a per-claim
page jump where none exists.

### Reader-compatible scan copies

A parser scan found **12** sources using CCITT compression: seven Class 9 2022 papers and the
five bundle excerpts. The installed PDF.js 6.3.289 routes CCITT through its JBig2/CCITT decoder,
which needs `wasmUrl` or its JavaScript fallback. The current reader supplies neither the decoder
URL nor decoder assets (only the worker is served). File downloads alone therefore would not be
enough to claim those scans display correctly.

The existing `rebuildChapterPdf` helper rebuilt those exact source-page sequences at its existing
120-DPI/JPEG-75 settings. Their page order, page count and upright orientation were retained.
The copies are linked at `*-readable.pdf`; original PDFs remain at their original local objects
and in caches. This introduces raster/JPEG compression, not regenerated academic text. Final
parser checks found no CCITT/JBIG2/JPX image filters in the currently linked PDFs. Representative
final readable scans were rendered and visually checked for legibility; not every page was
visually reviewed. No CSP weakening or application decoder dependency was introduced.

All 12 current reader copies passed full public download/hash checks. The catalog distinguishes
them from unchanged original/chapter files. Exactly **12 source paths differ from the backup**:
five previously null bundle paths and seven existing paper paths. There were 17 path-update
operations because the five bundle excerpts were first published/verified, then switched to
their readable copies. No other source column changed.

## Minimal application changes

- Doubts now resolves its reader unit from freshly fetched options rather than only a saved
  localStorage unit snapshot. A previously saved `pdfUrl:null` can therefore pick up a recovered
  PDF without the student having to discard the question/history.
- Reader labels now say “Source PDF pages” or “OCR text. The source PDF is unavailable for this
  selection.” This does not claim visual verification or imply a missing PDF was recovered.
- No Ask normalization, retrieval, gate, generation, review or latency setting changed.

These changes were type-checked and built. Their full interactive behavior remains untested in
a browser; no claim is made that offline Ask render tests cover canvas interactions.

## Actual completed checks

| Check | Actual result |
| --- | --- |
| All current PDFs reopened by parser | 497 valid, zero parse failures; page counts recorded |
| Full public downloads during publication | Every published object matched its prepared bytes/hash and application/pdf type |
| Actual options API across curriculum scopes | 34 scopes, 498 units, 497 PDF links; one null PDF link |
| Current URL, byte signature, MIME, range and page-offset probes | All 497 current links passed; HTTP 206 for prefix ranges |
| Storage access from app origin | CORS allowed localhost:3100 for every checked public PDF |
| Local auth and page | Real login HTTP 200, authenticated /doubts HTTP 200 |
| Pilot citation/source metadata | Exact chunk ID, stored page and excerpt still match; book 57 maps to PDF 13 |
| Sample PDF visual checks | Pilot cited page; selected bundle covers/upright first pages; final readable Physics/Islamiyat scans |
| npm.cmd run lint | Passed |
| npm.cmd run test:ask | 58 passed, zero failed; offline fixtures, not PDF browser acceptance |
| Local-overlay production build | Passed; existing PDF.js Node legacy-build warning remains |
| git diff --check | Passed at final inspection |
| Browser clicks, canvas rendering, responsive interaction | **Not run: no available browser** |

A separate Node PDF.js/canvas experiment loaded the pilot document but terminated during raster
render without producing a usable result. It is not counted as a passed PDF.js render, nor does
it prove the browser viewer failed. Successful Poppler rendering and HTTP checks are reported
separately. Browser validation remains required, including citation clicking and rapid page changes.

### Proof that curriculum data was preserved

Before and after recovery, PostgreSQL computed a deterministic fingerprint of every row, ordered
by ID. Chunk fingerprints include the stored OCR text **and embeddings**. Only storage_path was
excluded from the source-identity fingerprint:

| Table / identity | Rows before = after | Fingerprint before = after |
| --- | ---: | --- |
| content_chunks | 8,594 | `6d8b204bc6893081edf337ad947e7b70` |
| sections | 8,491 | `502c1ad728968b9f55035695e3abf043` |
| chapters | 494 | `2561ba53e59ac3029b4d25d46c0fba87` |
| chapter_sources excluding storage_path | 498 | `a8a47a8fd6e9b05446732ececa914e05` |

No OCR, re-embedding, reset, corpus migration, citation metadata edit or hosted database write
was performed. Existing external model credentials were not printed or used for this recovery.

## Unresolved source and fallback

FBISE / Class 9 / Chemistry / model paper / **2026**, source ID
`b09b9e71-018a-42eb-bdca-67ce4c019bb1`, has no matching manifest identity/provenance for that year.
The database path remains unchanged and no object was created at it. The options endpoint was
checked: this unit returns `pdfUrl:null` and the app retains OCR text. The available 2025 paper
was **not silently substituted**, even though older recovery documentation on another machine
called this a legacy duplicate. Resolving it requires reliable provenance for the 2026 row or an
explicitly justified catalog correction; neither was assumed.

## Review and local artifacts

Open the local app, sign in with the existing ignored review credentials, and select Physics /
Textbook / Class 10 / chapter 2. Existing saved cooling answers can be used without a new provider
call. Clicking the page-57 citation should render PDF page 13. This is the manual acceptance step
still awaiting an available browser. Also check one `*-readable.pdf` paper, an Urdu source and the
unresolved Chemistry 2026 OCR fallback. Unknown paper page metadata must stay unknown.

Detailed private recovery artifacts live under `.recovery/`: source inventory, recovery plan,
extraction/publish/parser/HTTP reports, cached official bundle downloads and prepared files. The
scripts guard publication to localhost and reuse the repository upload/rebuild helpers. They are
specific to this recovery snapshot; do not run ingestion/reset scripts or overwrite the private
environment overlay to reproduce these checks. The catalog is the reviewable, nonsecret record
of final file identities and paths.

The current HTTP check can be repeated without model calls using
`node .recovery/pdf-http-verify.mjs` while the local app and Supabase are running.
