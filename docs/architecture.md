# Lens architecture

## Product contract

Lens is an agent-assisted reading workspace for papers and books. The original
document is the source of truth. Extraction is machine-facing infrastructure;
it never replaces the original rendering. Every answer that claims to describe
the document must point to a page-level anchor.

## Module boundaries

| Module | Owns | Must not own |
| --- | --- | --- |
| `domain` | Shared document, anchor, session and evidence contracts | React state, API calls, rendering |
| `features/library` | Import, library browsing and document discovery | PDF rendering, agent prompting |
| `features/reader` | Original document rendering, selection and navigation | Persisted agent conversations |
| `features/agent` | Questions, context inspection and model-provider boundary | PDF DOM manipulation |
| `features/workbench` | Shell layout, tabs, panels and view state | Document parsing or agent policy |
| `db` / `app/api` | Durable documents, pages, annotations and messages | UI-specific state |

## Stable objects

- `ReadingDocument`: a durable original file and its descriptive metadata.
- `ReadingAnchor`: a document-local reference. It currently supports a page and
  selected text; later it may carry a rectangle or text range without changing
  the caller contract.
- `ReadingSession`: why the user is reading a document and which extraction
  mode is active.
- `EvidenceContext`: the explicit source material passed to an agent task.

## Agent context policy

The whole document is indexed at import, not blindly appended to every prompt.
Every task starts with the active anchor and expands only to nearby text, the
current section, directly related figures/tables, and confirmed user knowledge.
Enhanced multimodal processing is opt-in for images, tables, formulas, or
scans that need it.

An answer must distinguish: document evidence, background explanation, and
inference or uncertainty. A model provider is an adapter, so a manual
copy-to-chat workflow, a local model, or a future API can share the same
evidence bundle.

## Delivery order

1. M0: shell/module boundaries and stable contracts.
2. M1: reliable original-document reading and anchors.
3. M2: versioned normal/enhanced extraction with debug output.
4. M3: reading tasks and grounded agent requests.
5. M4: cross-document knowledge cards and synthesis.

## Explicit non-goals for M0

- Do not reproduce every WPS feature.
- Do not invoke a model automatically.
- Do not make parsed text the visible replacement for a PDF.
- Do not store an answer without its document context.
