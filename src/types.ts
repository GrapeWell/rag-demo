// 向量数据库里存的一条记录
export interface ChunkRecord {
  id: string;
  text: string;       // 片段文本
  vector: number[];   // 512维向量
  docId: string;      // 属于哪个文档
  docName: string;    // 文档文件名
  chunkIndex: number; // 在文档内的序号
  createdAt: string;
}

// 文档列表里展示的一条文档信息
export interface DocumentInfo {
  docId: string;
  docName: string;
  chunkCount: number;
  uploadedAt: string;
}

// 检索结果
export interface SearchResult {
  text: string;
  docName: string;
  chunkIndex: number;
  similarity: number;
}

// 回答来源引用
export interface Source {
  docName: string;
  text: string;
  chunkIndex: number;
}

// 上传接口返回
export interface UploadResult {
  docId: string;
  docName: string;
  chunkCount: number;
}

// 健康检查状态
export interface HealthStatus {
  status: 'loading' | 'ready' | 'error';
  llm: boolean;
  embedding: boolean;
  message: string;
}
