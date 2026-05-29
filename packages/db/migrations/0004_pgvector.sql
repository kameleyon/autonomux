-- ============================================================================
-- autonomux · 0004_pgvector.sql · Phase 1.0-A5
-- Owner: [Atlas]
-- Enables pgvector and indexes agent_memory_episodes.embedding.
--
-- Index choice: HNSW (Hierarchical Navigable Small World).
--   Why HNSW over IVFFlat:
--     - Better recall at low query latency for our expected scale
--       (≤ 100k episodes per tenant; ~1M across all tenants at Phase 2).
--     - No "training" / re-index step required — IVFFlat needs periodic
--       re-cluster as the dataset grows.
--     - Cosine distance is the right metric for OpenAI/Voyage 1536-dim
--       embeddings used by [Cipher]'s embedding pipeline.
--   Trade-off: HNSW build is slower + uses more memory at write time. Acceptable
--   here because episodes are appended at conversational pace, not bulk-loaded.
--
-- The pre-filter on tenant_id is enforced by RLS at query time; we additionally
-- include tenant_id in a B-tree to make the planner happy when combining a
-- vector search with the tenancy predicate.
-- ============================================================================

create extension if not exists "vector";

-- HNSW index on the embedding column.
-- Cosine distance ('vector_cosine_ops') matches the embedding model output.
-- m = 16, ef_construction = 64 are pgvector defaults; tune per Phase 2 perf review.
create index if not exists agent_memory_episodes_embedding_hnsw_idx
    on public.agent_memory_episodes
    using hnsw (embedding vector_cosine_ops)
    with (m = 16, ef_construction = 64);

-- Composite predicate index: tenant_id + created_at for filtered recent queries.
-- (Already created in 0001_init.sql; here only as a defensive idempotent re-check.)
create index if not exists agent_memory_episodes_tenant_created_idx
    on public.agent_memory_episodes(tenant_id, created_at desc);

-- End 0004_pgvector.sql
