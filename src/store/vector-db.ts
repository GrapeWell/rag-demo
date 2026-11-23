import * as lancedb from '@lancedb/lancedb';
import type { Connection, Table } from '@lancedb/lancedb';
import path from 'path';
import type { ChunkRecord } from '../types';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'lancedb');
const TABLE_NAME = 'chunks';

let db: Connection | null = null;
let table: Promise<Table> | undefined;
let textIndex: Promise<void> | undefined;

export async function getDb(): Promise<Connection> {
  if (!db) db = await lancedb.connect(DATA_DIR);
  return db;
}

export async function getTable(): Promise<Table> {
  return table ??= openChunksTable().catch((error) => {
    table = undefined;
    throw error;
  });
}

async function openChunksTable(): Promise<Table> {
  const conn = await getDb();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    return conn.openTable(TABLE_NAME);
  }

  // 先用一条记录创建表，然后删除（LanceDB需要判断schema）
  const created = await conn.createTable(TABLE_NAME, [{
    id: '', text: '', vector: new Array(512).fill(0) as number[],
    docId: '', docName: '', chunkIndex: 0, createdAt: new Date().toISOString(),
  }]);
  await created.delete('id = ""');
  return created;
}


// 添加片段（批量）
export async function addChunks(records: ChunkRecord[]): Promise<void> {
  const tbl = await getTable();
  await tbl.add(records as unknown as Array<Record<string, unknown>>)
}

// 向量检索
export async function searchChunks(vector: number[], limit = 5) {
  const tbl = await getTable();
  const results = await tbl.vectorSearch(vector)
    .distanceType('cosine')
    .limit(limit)
    .toArray();

  return results.map((r: Record<string, unknown>) => ({
    ...toChunkMatch(r),
    docId: r.docId as string,
    _distance: r._distance as number,
  }))
}

function toChunkMatch(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    text: row.text as string,
    docName: row.docName as string,
    chunkIndex: row.chunkIndex as number,
  };
}

async function createTextIndexIfNeeded(tbl: Table): Promise<void> {
  const indices = await tbl.listIndices();
  if (indices.some((index) => index.indexType === 'FTS' && index.columns.includes('text'))) return;

  // 默认分词依赖空白和标点，连续中文用字符 n-gram 切分。
  await tbl.createIndex('text', {
    config: lancedb.Index.fts({
      baseTokenizer: 'ngram',
      ngramMinLength: 2,
      ngramMaxLength: 3,
      prefixOnly: false,
      stem: false,
      removeStopWords: false,
    }),
    replace: false,
  });
}

export async function searchChunksByText(query: string, limit = 5) {
  const tbl = await getTable();
  textIndex ??= createTextIndexIfNeeded(tbl).catch((error) => {
    textIndex = undefined;
    throw error;
  });
  await textIndex;

  const results = await tbl.query()
    .fullTextSearch(query, { columns: ['text'] })
    .select(['id', 'text', 'docName', 'chunkIndex', '_score'])
    .limit(limit)
    .toArray();
  return results.map(toChunkMatch);
}

// 文档统计
export async function getDocumentStats() {
  const tbl = await getTable();
  const data = await tbl.query().toArray();
  const map = new Map();

  for (const row of data) {
    const r = row as Record<string, unknown>;
    const docId = r.docId as string;
    if (!map.has(docId)) {
      map.set(docId, { docName: r.docName, chunkCount: 0, uploadedAt: r.createdAt })
    }
    map.get(docId).chunkCount++;
  }

  return Array.from(map.entries()).map(([docId, info]) => ({docId, ...info}))
}

export async function deleteDocument(docId: string): Promise<void> {
  const tbl = await getTable();
  await tbl.delete(`docId = "${docId}"`);
}

export async function hasDocuments(): Promise<boolean> {
  const tbl = await getTable();
  return (await tbl.countRows()) > 0;
}
