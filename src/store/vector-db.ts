import * as lancedb from '@lancedb/lancedb';
import type { Connection, Table } from '@lancedb/lancedb';
import path from 'path';
import type { ChunkRecord } from '../types';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'lancedb');
const TABLE_NAME = 'chunks';

let db: Connection | null = null;
let table: Table | null = null;

export async function getDb(): Promise<Connection> {
  if (!db) db = await lancedb.connect(DATA_DIR);
  return db;
}

export async function getTable(): Promise<Table> {
  if (table) return table;
  const conn = await getDb();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    table = await conn.openTable(TABLE_NAME);
  } else {
    // 先用一条记录创建表，然后删除（LanceDB需要判断schema）
    table = await conn.createTable(TABLE_NAME, [{
      id: '', text: '', vector: new Array(512).fill(0) as number[],
      docId: '', docName: '', chunkIndex: 0, createdAt: new Date().toISOString(),
    }]);
    await (table as Table).delete('id = ""')
  }

  return table;
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
    text: r.text as string,
    docName: r.docName as string,
    chunkIndex: r.chunkIndex as number,
    docId: r.docId as string,
    _distance: r._distance as number,
  }))
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
