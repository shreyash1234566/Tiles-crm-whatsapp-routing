/**
 * lib/ai-agent/retriever.ts
 *
 * Portable cosine-similarity search over wa_knowledge_chunks.
 * Embeddings are stored as JSONB so standard PostgreSQL installs do not need
 * the optional pgvector extension.
 */

import { prisma } from '@/lib/db'

export interface RetrievedChunk {
  id: string
  content: string
  similarity: number
}

/**
 * Find the top-K most similar knowledge chunks for a given user.
 *
 * @param userId        - The CRM user whose knowledge base to search.
 * @param queryEmbedding - The embedding vector of the incoming customer message.
 * @param topK          - Maximum number of chunks to return (default 3).
 * @param minSimilarity - Cosine similarity threshold (default 0.4).
 */
export async function retrieveChunks(
  userId: string,
  queryEmbedding: number[],
  topK = 3,
  minSimilarity = 0.4,
): Promise<RetrievedChunk[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; content: string; embedding: unknown }>>(`
    SELECT id, content, embedding
    FROM wa_knowledge_chunks
    WHERE user_id = $1 AND embedding IS NOT NULL
  `, userId)

  const queryNorm = Math.sqrt(queryEmbedding.reduce((sum, value) => sum + value * value, 0)) || 1
  return rows.map(row => {
    const embedding = Array.isArray(row.embedding)
      ? row.embedding.map(Number)
      : typeof row.embedding === 'string'
        ? JSON.parse(row.embedding).map(Number)
        : []
    const length = Math.min(queryEmbedding.length, embedding.length)
    let dot = 0
    let embeddingNorm = 0
    for (let i = 0; i < length; i++) {
      dot += queryEmbedding[i] * embedding[i]
      embeddingNorm += embedding[i] * embedding[i]
    }
    const similarity = embeddingNorm > 0 ? dot / (queryNorm * Math.sqrt(embeddingNorm)) : 0
    return { id: row.id, content: row.content, similarity }
  }).filter(row => row.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
}
