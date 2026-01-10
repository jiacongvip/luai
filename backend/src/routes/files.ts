import express from 'express';
import { query } from '../db/connection.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { auditLog } from '../middleware/security.js';
import { getActiveApiConfig } from '../services/apiService.js';

const router = express.Router();

// ============================================
// Embedding 服务（支持 NewAPI / OpenAI 兼容接口）
// ============================================

/**
 * 生成文本的嵌入向量
 * 优先使用 NewAPI 配置，支持 OpenAI 兼容的 /v1/embeddings 接口
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const apiConfig = await getActiveApiConfig();
    if (!apiConfig) {
      console.warn('⚠️ No API config found for embedding');
      return null;
    }

    // 构建 embedding 请求 URL
    // NewAPI / OpenAI 兼容接口通常是 baseUrl + /v1/embeddings
    let embeddingUrl = apiConfig.baseUrl;
    if (!embeddingUrl.endsWith('/v1/embeddings')) {
      embeddingUrl = embeddingUrl.replace(/\/v1\/chat\/completions\/?$/, '/v1/embeddings');
      if (!embeddingUrl.endsWith('/v1/embeddings')) {
        embeddingUrl = embeddingUrl.replace(/\/?$/, '/v1/embeddings');
      }
    }

    // 选择 embedding 模型
    // 优先使用 modelMapping 中配置的 embedding 模型，否则使用默认模型
    const embeddingModel = apiConfig.modelMapping?.['embedding'] 
      || apiConfig.modelMapping?.['text-embedding-3-small']
      || 'text-embedding-3-small';  // OpenAI 默认 embedding 模型

    console.log(`📊 Generating embedding via ${apiConfig.provider}: ${embeddingUrl}`);

    const response = await fetch(embeddingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiConfig.apiKey}`,
        ...(apiConfig.requestConfig?.headers || {}),
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Embedding API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;
    
    if (embedding && Array.isArray(embedding)) {
      console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
      return embedding;
    }

    console.warn('⚠️ No embedding in response:', data);
    return null;
  } catch (error: any) {
    console.error('❌ Embedding generation failed:', error.message);
    return null;
  }
}

// ============================================
// 知识库/文件管理 API
// ============================================

// 获取用户文件列表
router.get('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { projectId, agentId } = req.query;

    let queryStr = `
      SELECT id, file_name, file_type, file_size, storage_path, project_id, agent_id, uploaded_at
      FROM files
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (projectId) {
      params.push(projectId);
      queryStr += ` AND project_id = $${params.length}`;
    }

    if (agentId) {
      params.push(agentId);
      queryStr += ` AND agent_id = $${params.length}`;
    }

    queryStr += ` ORDER BY uploaded_at DESC`;

    const result = await query(queryStr, params);

    res.json(result.rows.map(file => ({
      id: file.id,
      fileName: file.file_name,
      fileType: file.file_type,
      fileSize: file.file_size,
      storagePath: file.storage_path,
      projectId: file.project_id,
      agentId: file.agent_id,
      uploadedAt: file.uploaded_at,
    })));
  } catch (error: any) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

// 上传文件（Base64 方式，适合小文件）
router.post('/upload', authenticate, auditLog('CREATE', 'file'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { fileName, fileType, fileContent, projectId, agentId } = req.body;

    if (!fileName || !fileContent) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 解码 Base64 内容
    const contentBuffer = Buffer.from(fileContent, 'base64');
    const fileSize = contentBuffer.length;

    // 限制文件大小（10MB）
    if (fileSize > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }

    // 提取文本内容（简化版，实际需要使用专门的解析库）
    let contentText = '';
    if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
      contentText = contentBuffer.toString('utf-8');
    } else if (fileType === 'application/json' || fileName.endsWith('.json')) {
      contentText = contentBuffer.toString('utf-8');
    } else if (fileName.endsWith('.md')) {
      contentText = contentBuffer.toString('utf-8');
    }
    // PDF、Word 等需要专门的解析库，这里暂时跳过

    const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // 存储路径（实际应该上传到 S3/GCS）
    const storagePath = `/uploads/${userId}/${fileId}/${fileName}`;

    // 保存文件元数据
    await query(
      `INSERT INTO files (id, user_id, project_id, agent_id, file_name, file_type, file_size, storage_path, content_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [fileId, userId, projectId || null, agentId || null, fileName, fileType, fileSize, storagePath, contentText]
    );

    // 如果有文本内容，创建知识向量（RAG）
    if (contentText && contentText.length > 0) {
      await createKnowledgeVectors(fileId, contentText);
    }

    res.json({
      success: true,
      file: {
        id: fileId,
        fileName,
        fileType,
        fileSize,
        storagePath,
      },
    });
  } catch (error: any) {
    console.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// 创建知识向量（RAG）
async function createKnowledgeVectors(fileId: string, content: string) {
  try {
    // 将内容分割成块（每块约 500 字符）
    const chunks = splitIntoChunks(content, 500);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // 生成嵌入向量（使用 NewAPI / OpenAI 兼容接口）
      const embedding = await generateEmbedding(chunk);

      const vectorId = `vec_${Date.now()}_${i}`;

      // 存储向量
      if (embedding) {
        try {
        await query(
          `INSERT INTO knowledge_vectors (id, file_id, chunk_index, chunk_content, embedding, metadata)
           VALUES ($1, $2, $3, $4, $5::vector, $6)`,
          [vectorId, fileId, i, chunk, `[${embedding.join(',')}]`, JSON.stringify({ chunkIndex: i })]
        );
        } catch (dbErr: any) {
          // 如果 vector 扩展不可用，只存储文本
          console.warn('Vector insert failed (pgvector may not be installed), storing text only:', dbErr.message);
          await query(
            `INSERT INTO knowledge_vectors (id, file_id, chunk_index, chunk_content, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [vectorId, fileId, i, chunk, JSON.stringify({ chunkIndex: i })]
          );
        }
      } else {
        // 没有向量，只存储文本（fallback：关键词搜索）
        try {
        await query(
          `INSERT INTO knowledge_vectors (id, file_id, chunk_index, chunk_content, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [vectorId, fileId, i, chunk, JSON.stringify({ chunkIndex: i })]
        );
        } catch (dbErr: any) {
          console.warn('Failed to store text chunk:', dbErr.message);
        }
      }
    }

    console.log(`✅ Created ${chunks.length} knowledge vectors for file ${fileId}`);
  } catch (error) {
    console.error('Create knowledge vectors error:', error);
  }
}

// 文本分块函数
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[。！？.!?\n]+/);
  
  let currentChunk = '';
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// 知识检索（RAG Search）
router.post('/search', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { query: searchQuery, projectId, agentId, limit = 5 } = req.body;

    if (!searchQuery) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // 生成查询向量（使用 NewAPI / OpenAI 兼容接口）
    const queryEmbedding = await generateEmbedding(searchQuery);

    let results;

    if (queryEmbedding) {
      // 向量相似度搜索
      try {
      let searchSql = `
        SELECT 
          kv.id, kv.chunk_content, kv.chunk_index, kv.metadata,
          f.file_name, f.id as file_id,
          1 - (kv.embedding <=> $1::vector) as similarity
        FROM knowledge_vectors kv
        JOIN files f ON kv.file_id = f.id
        WHERE f.user_id = $2
      `;
      const params: any[] = [`[${queryEmbedding.join(',')}]`, userId];

      if (projectId) {
        params.push(projectId);
        searchSql += ` AND f.project_id = $${params.length}`;
      }

      if (agentId) {
        params.push(agentId);
        searchSql += ` AND f.agent_id = $${params.length}`;
      }

      searchSql += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
      params.push(Number(limit));

      const searchResult = await query(searchSql, params);
      results = searchResult.rows;
      } catch (vectorErr: any) {
        console.warn('Vector search failed, falling back to keyword search:', vectorErr.message);
        // 如果向量搜索失败，回退到关键词搜索
        results = null;
      }
    }
    
    if (!results) {
      // 回退到关键词搜索
      let searchSql = `
        SELECT 
          kv.id, kv.chunk_content, kv.chunk_index, kv.metadata,
          f.file_name, f.id as file_id,
          0.5 as similarity
        FROM knowledge_vectors kv
        JOIN files f ON kv.file_id = f.id
        WHERE f.user_id = $1 AND kv.chunk_content ILIKE $2
      `;
      const params: any[] = [userId, `%${searchQuery}%`];

      if (projectId) {
        params.push(projectId);
        searchSql += ` AND f.project_id = $${params.length}`;
      }

      if (agentId) {
        params.push(agentId);
        searchSql += ` AND f.agent_id = $${params.length}`;
      }

      searchSql += ` LIMIT $${params.length + 1}`;
      params.push(Number(limit));

      const searchResult = await query(searchSql, params);
      results = searchResult.rows;
    }

    res.json({
      results: results.map((row: any) => ({
        id: row.id,
        content: row.chunk_content,
        chunkIndex: row.chunk_index,
        fileName: row.file_name,
        fileId: row.file_id,
        similarity: parseFloat(row.similarity),
        metadata: row.metadata,
      })),
    });
  } catch (error: any) {
    console.error('Search knowledge error:', error);
    res.status(500).json({ error: 'Failed to search knowledge base' });
  }
});

// 删除文件
router.delete('/:id', authenticate, auditLog('DELETE', 'file'), async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    // 验证文件所有权
    const fileResult = await query(
      `SELECT id FROM files WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    // 删除关联的向量 (try-catch 避免因为 pgvector 未安装导致表不存在而失败)
    try {
    await query(`DELETE FROM knowledge_vectors WHERE file_id = $1`, [id]);
    } catch (vErr: any) {
      console.warn('Could not delete knowledge vectors (table might not exist):', vErr.message);
    }

    // 删除文件记录
    await query(`DELETE FROM files WHERE id = $1`, [id]);

    // 实际还需要删除存储的文件（S3/GCS）

    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// 获取文件内容
router.get('/:id/content', authenticate, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const result = await query(
      `SELECT content_text, file_name, file_type FROM files WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      fileName: result.rows[0].file_name,
      fileType: result.rows[0].file_type,
      content: result.rows[0].content_text,
    });
  } catch (error: any) {
    console.error('Get file content error:', error);
    res.status(500).json({ error: 'Failed to get file content' });
  }
});

export default router;

