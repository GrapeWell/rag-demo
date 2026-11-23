import { searchChunks, searchChunksByText } from "../store/vector-db";
import { embedSingle } from "./embedder";
import type { SearchResult } from "../types";

const MIN_SIMILARITY = 0.5;
const RRF_K = 60;

export async function retrieve(query: string, topK = 5): Promise<SearchResult[]> {
  const candidateLimit = topK * 2;
  const [vectorResults, keywordMatches] = await Promise.all([
    embedSingle(query).then((vector) => searchChunks(vector, candidateLimit)),
    searchChunksByText(query, candidateLimit),
  ]);
  const vectorMatches = vectorResults
    .map(({ id, text, docName, chunkIndex, _distance }) => ({
      id, text, docName, chunkIndex, similarity: 1 - _distance,
    }))
    .filter((chunk) => chunk.similarity >= MIN_SIMILARITY);

  const ranked = new Map<string, { chunk: SearchResult; score: number }>();
  for (const matches of [vectorMatches, keywordMatches]) {
    matches.forEach(({ id, ...chunk }, index) => {
      const score = 1 / (RRF_K + index + 1);
      const match = ranked.get(id);
      if (match) match.score += score;
      else ranked.set(id, { chunk, score });
    });
  }

  console.log([...ranked.values()]
    .sort((a, b) => b.score - a.score)
    )

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ chunk }) => chunk);
}
