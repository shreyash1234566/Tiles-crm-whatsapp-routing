# Phase 3 — Catalog automation, visual intelligence, and scale

## Objective

Make the Evolution workflow proactive: a dealer can send a product code or reference photo, the system can find the right tile/granite/marble products and available lots, return approved price/media options, and ask a human when confidence is not sufficient. The system must remain local-first on the VPS for embeddings and retrieval, with explicit resource limits and human review for image matches.

## Work packages

### 1. Google Sheets/Drive catalog and rate-list connector

- Define a canonical catalog export containing SKU/code, product name, category, tile size, unit, finish, application, GST/HSN, dealer price tier, minimum quantity, stock status, lot/shade, photo/video URLs, and “shareable with dealer” flags.
- Add a connector using either a service account (single company-owned sheet/drive) or OAuth (per-company access). Store encrypted credentials and least-privilege scopes.
- Implement a scheduled sync plus manual “sync now”; record source file id, sheet tab, row number, checksum, last successful sync, and row-level errors.
- Make imports idempotent by external source id + SKU. Never overwrite a manually approved rate or inventory quantity without a conflict record.
- Normalize codes (case, spaces, hyphens, common OCR substitutions) and support exact-code lookup before semantic search.
- Index catalog text into the local RAG store with metadata filters for tiles/granite/marble, unit, application, active dealer price tier, and available stock.
- On a group query, return a controlled response: matched code, available quantity/lots, dealer-allowed rate, coverage/unit, and selected photos/videos. Require staff approval for a new or low-confidence code.

### 2. Lot/shade and media response automation

- Add a lot media table or extend `StoneLot` media metadata with photo type, pattern tags (`STRAIGHT_LINE`, `WAVY`, `CROSS`, etc.), capture date, shade, quality grade, and shareable flag.
- Generate a “send options” card for the responsible employee: top lots, available sqft/slabs, shade/quality, and media attachments.
- Enforce inventory reservations transactionally. A WhatsApp response must never imply stock is reserved until Warehouse confirms allocation.
- Add an approval step for price and media responses so the AI cannot expose internal cost, margin, supplier, or restricted lot information.

### 3. Image recognition for marble/stone inquiry matching

Neither BGE-M3 nor `Xenova/multilingual-e5-small` performs image recognition; both are text-embedding models. Use a separate visual pipeline:

1. Ingest and normalize dealer reference images and verified lot/slab images (EXIF removal, orientation, size, blur/quality checks).
2. Run OCR/code extraction first for printed labels, then a local vision encoder such as a CLIP/SigLIP-family image encoder to create image vectors. Keep image vectors in a separate table/index from text vectors.
3. Store `imageEmbeddingModel`, dimension, source image hash, lot/slab id, and quality metadata so vectors can be re-created after a model change.
4. Retrieve top-k visually similar lots, then rerank using product code, material category, shade/origin, thickness, finish, availability, and dealer constraints.
5. Return a confidence band: high-confidence suggestions may be shown to staff automatically; medium confidence requires staff confirmation; low confidence must become an “unable to identify—request code/more photos” task.
6. Keep a human-approved match log and use it as evaluation data. Do not claim exact natural-stone identification from a photo when lighting, polish, camera, or lot variation makes it ambiguous.

The existing cloud vision/recommendation endpoint is not a substitute for stock recognition: it analyzes or edits room/reference images and must not be treated as an inventory matcher. A local vision model can be introduced behind a feature flag; if the VPS has no GPU, run a quantized CPU worker with a strict queue and latency budget.

### 4. RAG model decision and migration plan

#### Recommendation for this VPS and workload

- **Phase 1/early Phase 2: keep `Xenova/multilingual-e5-small`.** The repo already has its ONNX integration, `query:`/`passage:` prefixes, 384-dimension vectors, singleton loading, and a lightweight JSONB retrieval path. It is the safer local CPU baseline for Hindi/Hinglish/English dealer messages and small catalog chunks.
- **Benchmark BGE-M3 before production migration.** BGE-M3 is the quality-oriented option for long multilingual catalog/policy text and hybrid lexical + semantic retrieval, but it is materially heavier. Its official model card specifies 1024-dimensional embeddings, up to 8192 tokens, and dense, sparse, and ColBERT-style retrieval outputs. That requires a new vector contract, more memory/CPU, and better indexing than the current JSONB cosine scan.
- **Do not choose either model for images.** Add the vision encoder described above and combine text/code retrieval with image retrieval/reranking.

#### Evaluation protocol

Create a gold set of at least 200 real or anonymized dealer queries covering Hindi, Hinglish, English, SKU/code typos, dimensions, rates, shade/lot questions, payment/dispatch questions, and image-linked queries. Measure Recall@5, MRR, exact-code accuracy, cross-language accuracy, p50/p95 embedding latency, peak RSS, cold-start time, and answer-groundedness/handoff rate.

Run:

- E5-small dense retrieval (current baseline).
- BGE-M3 dense retrieval with 1024-d storage.
- BGE-M3 dense + lexical/sparse candidate fusion for codes and exact terms.
- Optional reranker on only the top 20 candidates to cap CPU cost.

Promote BGE-M3 only if the measured retrieval gain justifies VPS memory/latency and after a migration rehearsal. Keep model version per chunk; never mix 384- and 1024-d vectors in one index.

#### If BGE-M3 is promoted

- Add `embedding_model`, `embedding_dimension`, `embedding_version`, and indexed-at fields.
- Move knowledge chunks from JSONB cosine scans to pgvector (the database image already supports pgvector) or a dedicated local vector index.
- Re-embed all documents in a background job, dual-read during validation, compare results, then switch the active model flag.
- Keep E5 vectors for rollback until the BGE-M3 evaluation window closes.

### 5. Scale, observability, and safety

- Separate webhook acknowledgement, routing, RAG, media download, catalog sync, image embedding, and follow-up sending into bounded queues with retry/dead-letter handling.
- Add per-group rate limits, WhatsApp quiet hours, maximum auto-replies per ticket, and circuit breakers for Evolution/LLM/provider outages.
- Track token usage, model latency, queue age, media storage, vector count, catalog sync freshness, match confidence, human corrections, and false-positive image matches.
- Encrypt provider credentials and connector tokens, restrict media URLs, validate MIME/content signatures, and redact phone/GST/payment data from logs.
- Add nightly PostgreSQL/Redis backup verification, upload retention policies, and a model/cache warm-up check after deployment.
- Load-test concurrent group messages, media bursts, catalog sync, and image queues against the VPS CPU/RAM budget before enabling auto-replies globally.

## Phase 3 acceptance criteria

1. A dealer’s exact SKU/code query returns only active, dealer-shareable tile/stone results with correct unit, rate tier, and available stock/lot data.
2. A catalog/rate-list sync is repeatable, auditable, conflict-safe, and does not expose internal cost or other dealers’ pricing.
3. A reference image produces ranked lot/slab suggestions with confidence and a human-review path; the system never represents an uncertain match as a confirmed identification.
4. The chosen text model and separate vision model run locally on the VPS within measured latency/RAM limits, with a documented fallback when the worker is unavailable.
5. RAG answers are grounded in approved catalog/knowledge chunks, cite the source item internally, and hand off on low confidence or commercial-risk intents.
6. Backups, queue recovery, provider circuit breakers, and model-version rollback have been exercised successfully.

## References for the embedding decision

- [BAAI/bge-m3 model card](https://huggingface.co/BAAI/bge-m3) — 1024 dimensions, 8192-token context, multilingual dense/sparse/multi-vector retrieval.
- [BGE-M3 paper](https://arxiv.org/abs/2402.03216) — unified multilingual multi-functionality retrieval design.
- [intfloat/multilingual-e5-small model card](https://huggingface.co/intfloat/multilingual-e5-small) — 384 dimensions, 512-token input, 100-language coverage, and required `query:`/`passage:` prefixes.
- [Multilingual E5 technical report](https://arxiv.org/abs/2402.05672) — training and multilingual retrieval details.

