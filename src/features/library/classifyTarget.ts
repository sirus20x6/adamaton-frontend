/**
 * Single source of truth for classifying user-pasted ingestion targets.
 *
 * Given an arbitrary string the user typed (or pasted), return the canonical
 * scheme-prefixed form (`arxiv:<id>`, `doi:<id>`, `url:<href>`) the backend
 * `/platform/sources/ingest` route expects. The logic handles both the bare
 * forms (`arxiv:2401.00001`) and the long forms users hit copy on
 * (`https://arxiv.org/pdf/2401.00001v2.pdf`, `https://doi.org/10.1038/...`).
 *
 * Both `IngestPanel` and `CorpusEmptyState` import from here so the two paste
 * boxes stay byte-for-byte identical.
 */

const ARXIV_ID_FRAGMENT = "(?:[a-zA-Z\\-.]+\\/\\d{7}|\\d{4}\\.\\d{4,5})(?:v\\d+)?";

const RAW_ARXIV_RE = new RegExp(`^(?:arxiv:)?(?<id>${ARXIV_ID_FRAGMENT})$`, "i");

const ARXIV_URL_RE = new RegExp(
  `^https?:\\/\\/(?:www\\.)?arxiv\\.org\\/(?:abs|pdf)\\/(?<id>${ARXIV_ID_FRAGMENT})(?:\\.pdf)?\\/?(?:\\?[^#]*)?(?:#.*)?$`,
  "i",
);

const RAW_DOI_RE = /^(?:doi:)?(?<id>10\.\d{4,9}\/\S+)$/i;

const DOI_URL_RE =
  /^https?:\/\/(?:dx\.)?doi\.org\/(?<id>10\.\d{4,9}\/\S+?)\/?(?:\?[^#]*)?(?:#.*)?$/i;

const URL_RE = /^https?:\/\//i;

const NUMERIC_ARXIV_RE = /^\d{4}\.\d{4,5}(?:v\d+)?$/;

/**
 * Classify a user-supplied ingestion target into the canonical
 * `scheme:value` shape. Returns an empty string if the input is blank.
 */
export function classifyTarget(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // 1. arXiv URL (https://arxiv.org/abs|pdf/<id>(.pdf)?, with optional vN).
  const arxivUrl = trimmed.match(ARXIV_URL_RE);
  if (arxivUrl?.groups?.id) return `arxiv:${arxivUrl.groups.id}`;

  // 2. DOI URL (https://doi.org/<doi>).
  const doiUrl = trimmed.match(DOI_URL_RE);
  if (doiUrl?.groups?.id) {
    // Strip a single trailing slash (DOIs are not path-like).
    return `doi:${doiUrl.groups.id.replace(/\/+$/, "")}`;
  }

  // 3. Raw arXiv id (arxiv:<id> or just <id>).
  const arxivRaw = trimmed.match(RAW_ARXIV_RE);
  if (arxivRaw?.groups?.id) return `arxiv:${arxivRaw.groups.id}`;

  // 4. Raw DOI (doi:<id> or 10.NNNN/...).
  const doiRaw = trimmed.match(RAW_DOI_RE);
  if (doiRaw?.groups?.id) return `doi:${doiRaw.groups.id}`;

  // 5. Numeric arxiv shorthand without scheme.
  if (NUMERIC_ARXIV_RE.test(trimmed)) return `arxiv:${trimmed}`;

  // 6. Anything that looks like a URL.
  if (URL_RE.test(trimmed)) return `url:${trimmed}`;

  // 7. Permissive fallback — let the backend decide.
  return `url:${trimmed}`;
}

/* ── Dev-only fixture sweep ────────────────────────────────────────────── */

type Fixture = readonly [input: string, expected: string];

const FIXTURES: readonly Fixture[] = [
  ["arxiv:2401.00001", "arxiv:2401.00001"],
  ["2401.00001", "arxiv:2401.00001"],
  ["2401.00001v2", "arxiv:2401.00001v2"],
  ["https://arxiv.org/abs/2401.00001", "arxiv:2401.00001"],
  ["https://arxiv.org/abs/2401.00001v2", "arxiv:2401.00001v2"],
  ["https://arxiv.org/pdf/2401.00001", "arxiv:2401.00001"],
  ["https://arxiv.org/pdf/2401.00001.pdf", "arxiv:2401.00001"],
  ["https://arxiv.org/pdf/2401.00001v2", "arxiv:2401.00001v2"],
  ["https://arxiv.org/pdf/2401.00001v2.pdf", "arxiv:2401.00001v2"],
  ["http://www.arxiv.org/abs/hep-th/0301001", "arxiv:hep-th/0301001"],
  ["10.1038/nature12345", "doi:10.1038/nature12345"],
  ["doi:10.1038/nature12345", "doi:10.1038/nature12345"],
  ["https://doi.org/10.1038/nature12345", "doi:10.1038/nature12345"],
  ["https://dx.doi.org/10.1038/nature12345", "doi:10.1038/nature12345"],
  ["https://example.com/paper", "url:https://example.com/paper"],
  ["", ""],
];

// Vite exposes `import.meta.env.DEV`. Run a one-shot fixture sweep on first
// import so regressions log a console error during local dev. Production
// builds skip this entirely.
if (import.meta.env.DEV) {
  for (const [input, expected] of FIXTURES) {
    const got = classifyTarget(input);
    if (got !== expected) {
      // eslint-disable-next-line no-console
      console.error(
        `[classifyTarget] fixture failure: input=${JSON.stringify(input)} ` +
          `expected=${JSON.stringify(expected)} got=${JSON.stringify(got)}`,
      );
    }
  }
}

export const __FIXTURES__ = FIXTURES;
