import { query } from '../db/connection.js';
import { GoogleGenAI } from '@google/genai';

// Gemini 客户端
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
});

// ============================================
// 工作流执行引擎
// ============================================

interface WorkflowNode {
  id: string;
  type: 'start' | 'end' | 'llm' | 'retrieval' | 'code' | 'condition' | 'agent' | 'classifier' | 'user_profile';
  data: {
    label: string;
    description?: string;
    // LLM Node
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    // Agent Node
    agentId?: string;
    // Condition Node
    variable?: string;
    operator?: 'contains' | 'equals' | 'empty';
    value?: string;
    // Classifier Node
    intents?: string[];
    // User Profile Node
    outputFields?: string[];
  };
  position: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  status: 'draft' | 'published';
}

interface ExecutionContext {
  input: string;
  variables: Record<string, any>;
  userId: string;
  projectData?: Record<string, any>;
}

interface NodeResult {
  nodeId: string;
  nodeType: string;
  status: 'success' | 'error';
  output: any;
  durationMs: number;
}

// 执行工作流
export async function executeWorkflow(
  workflow: Workflow,
  input: string,
  userId: string,
  projectData?: Record<string, any>
): Promise<{
  success: boolean;
  output: any;
  nodeResults: NodeResult[];
  executionId: string;
}> {
  const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const nodeResults: NodeResult[] = [];

  try {
    // 创建执行记录
    await query(
      `INSERT INTO workflow_executions (id, workflow_id, user_id, status, input_data)
       VALUES ($1, $2, $3, 'running', $4)`,
      [executionId, workflow.id, userId, JSON.stringify({ input })]
    );

    // 初始化执行上下文
    const context: ExecutionContext = {
      input,
      variables: { input },
      userId,
      projectData,
    };

    // 找到起始节点
    const startNode = workflow.nodes.find(n => n.type === 'start');
    if (!startNode) {
      throw new Error('Workflow has no start node');
    }

    // 执行工作流
    let currentNodeId = startNode.id;
    let output: any = input;
    let iterations = 0;
    const maxIterations = 50; // 防止无限循环

    while (currentNodeId && iterations < maxIterations) {
      iterations++;
      const node = workflow.nodes.find(n => n.id === currentNodeId);
      if (!node) break;

      // 如果是结束节点，退出
      if (node.type === 'end') {
        break;
      }

      // 执行节点
      const startTime = Date.now();
      let result: any;
      let status: 'success' | 'error' = 'success';
      let errorMessage: string | undefined;

      try {
        result = await executeNode(node, context, workflow);
        context.variables[node.id] = result;
        output = result;
      } catch (error: any) {
        status = 'error';
        errorMessage = error.message;
        result = { error: error.message };
      }

      const duration = Date.now() - startTime;

      // 记录节点执行日志
      const nodeResult: NodeResult = {
        nodeId: node.id,
        nodeType: node.type,
        status,
        output: result,
        durationMs: duration,
      };
      nodeResults.push(nodeResult);

      // 保存到数据库
      await query(
        `INSERT INTO workflow_node_logs (id, execution_id, node_id, node_type, status, input_snapshot, output_snapshot, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          executionId,
          node.id,
          node.type,
          status,
          JSON.stringify({ input: context.input, lastOutput: output }),
          JSON.stringify(result),
          duration,
        ]
      );

      if (status === 'error') {
        throw new Error(`Node ${node.id} failed: ${errorMessage}`);
      }

      // 确定下一个节点
      currentNodeId = await getNextNode(node, result, workflow, context);
    }

    // 更新执行状态为完成
    await query(
      `UPDATE workflow_executions SET status = 'completed', output_data = $1, completed_at = NOW() WHERE id = $2`,
      [JSON.stringify({ output }), executionId]
    );

    return {
      success: true,
      output,
      nodeResults,
      executionId,
    };
  } catch (error: any) {
    // 更新执行状态为失败
    await query(
      `UPDATE workflow_executions SET status = 'failed', error_message = $1, completed_at = NOW() WHERE id = $2`,
      [error.message, executionId]
    );

    return {
      success: false,
      output: { error: error.message },
      nodeResults,
      executionId,
    };
  }
}

// 执行单个节点
async function executeNode(
  node: WorkflowNode,
  context: ExecutionContext,
  workflow: Workflow
): Promise<any> {
  switch (node.type) {
    case 'start':
      return context.input;

    case 'llm':
      return await executeLLMNode(node, context);

    case 'agent':
      return await executeAgentNode(node, context);

    case 'condition':
      return evaluateCondition(node, context);

    case 'classifier':
      return await executeClassifierNode(node, context);

    case 'user_profile':
      return executeUserProfileNode(node, context);

    case 'code':
      return await executeCodeNode(node, context);

    case 'retrieval':
      return await executeRetrievalNode(node, context);

    default:
      return context.variables.lastOutput || context.input;
  }
}

// LLM 节点
async function executeLLMNode(node: WorkflowNode, context: ExecutionContext): Promise<string> {
  const model = node.data.model || 'gemini-2.0-flash';
  const systemPrompt = node.data.systemPrompt || 'You are a helpful assistant.';
  const temperature = node.data.temperature || 0.7;

  // 替换变量
  let prompt = systemPrompt;
  for (const [key, value] of Object.entries(context.variables)) {
    prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }

  const response = await genAI.models.generateContent({
    model,
    contents: `${prompt}\n\nUser Input: ${context.input}`,
    config: {
      temperature,
      maxOutputTokens: node.data.maxTokens || 1024,
    },
  });

  return response.text || '';
}

// Agent 节点
async function executeAgentNode(node: WorkflowNode, context: ExecutionContext): Promise<string> {
  const agentId = node.data.agentId;
  if (!agentId) {
    throw new Error('Agent node requires agentId');
  }

  // 获取智能体信息
  const agentResult = await query('SELECT system_prompt FROM agents WHERE id = $1', [agentId]);
  if (agentResult.rows.length === 0) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const systemPrompt = agentResult.rows[0].system_prompt;

  // 调用 LLM
  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: `${systemPrompt}\n\nUser: ${context.input}`,
  });

  return response.text || '';
}

// 条件节点
function evaluateCondition(node: WorkflowNode, context: ExecutionContext): boolean {
  const variable = node.data.variable || 'input';
  const operator = node.data.operator || 'contains';
  const value = node.data.value || '';

  const targetValue = String(context.variables[variable] || context.input);

  switch (operator) {
    case 'contains':
      return targetValue.toLowerCase().includes(value.toLowerCase());
    case 'equals':
      return targetValue.toLowerCase() === value.toLowerCase();
    case 'empty':
      return !targetValue || targetValue.trim() === '';
    default:
      return false;
  }
}

// 分类器节点
async function executeClassifierNode(node: WorkflowNode, context: ExecutionContext): Promise<string> {
  const intents = node.data.intents || [];
  if (intents.length === 0) {
    return 'unknown';
  }

  const prompt = `Classify the following user message into one of these categories: ${intents.join(', ')}

User message: "${context.input}"

Respond with ONLY the category name, nothing else.`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt,
  });

  const result = (response.text || '').trim().toLowerCase();
  return intents.find(i => i.toLowerCase() === result) || intents[0];
}

// 用户画像节点
function executeUserProfileNode(node: WorkflowNode, context: ExecutionContext): Record<string, any> {
  const outputFields = node.data.outputFields || [];
  const profile: Record<string, any> = {};

  if (context.projectData) {
    for (const field of outputFields) {
      if (context.projectData[field] !== undefined) {
        profile[field] = context.projectData[field];
      }
    }
  }

  return profile;
}

// 代码节点
async function executeCodeNode(node: WorkflowNode, context: ExecutionContext): Promise<any> {
  // 安全考虑，暂不支持真实代码执行
  // 可以接入沙箱环境
  return {
    message: 'Code execution is disabled for security reasons',
    input: context.input,
  };
}

// 知识检索节点
async function executeRetrievalNode(node: WorkflowNode, context: ExecutionContext): Promise<string> {
  // 简化版：返回相关知识
  const searchResult = await query(
    `SELECT chunk_content FROM knowledge_vectors kv
     JOIN files f ON kv.file_id = f.id
     WHERE f.user_id = $1
     ORDER BY RANDOM()
     LIMIT 3`,
    [context.userId]
  );

  if (searchResult.rows.length === 0) {
    return 'No relevant knowledge found.';
  }

  return searchResult.rows.map((r: any) => r.chunk_content).join('\n\n---\n\n');
}

// 获取下一个节点
async function getNextNode(
  currentNode: WorkflowNode,
  result: any,
  workflow: Workflow,
  context: ExecutionContext
): Promise<string | null> {
  const outgoingEdges = workflow.edges.filter(e => e.source === currentNode.id);

  if (outgoingEdges.length === 0) {
    return null;
  }

  // 条件节点：根据结果选择分支
  if (currentNode.type === 'condition') {
    const isTrue = result === true;
    const edge = outgoingEdges.find(e => 
      (isTrue && e.label?.toLowerCase() === 'true') ||
      (!isTrue && e.label?.toLowerCase() === 'false')
    ) || outgoingEdges[0];
    return edge?.target || null;
  }

  // 分类器节点：根据分类结果选择分支
  if (currentNode.type === 'classifier') {
    const intent = String(result).toLowerCase();
    const edge = outgoingEdges.find(e => 
      e.label?.toLowerCase() === intent
    ) || outgoingEdges[0];
    return edge?.target || null;
  }

  // 默认：选择第一条边
  return outgoingEdges[0]?.target || null;
}

// 获取执行历史
export async function getExecutionHistory(userId: string, workflowId?: string, limit = 20) {
  let sql = `
    SELECT e.id, e.workflow_id, e.status, e.input_data, e.output_data, 
           e.error_message, e.started_at, e.completed_at,
           w.name as workflow_name
    FROM workflow_executions e
    LEFT JOIN workflows w ON e.workflow_id = w.id
    WHERE e.user_id = $1
  `;
  const params: any[] = [userId];

  if (workflowId) {
    params.push(workflowId);
    sql += ` AND e.workflow_id = $${params.length}`;
  }

  sql += ` ORDER BY e.started_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await query(sql, params);

  return result.rows.map((row: any) => ({
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    status: row.status,
    inputData: row.input_data,
    outputData: row.output_data,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));
}

// 获取执行详情（包括节点日志）
export async function getExecutionDetails(executionId: string) {
  const execResult = await query(
    `SELECT * FROM workflow_executions WHERE id = $1`,
    [executionId]
  );

  if (execResult.rows.length === 0) {
    return null;
  }

  const logsResult = await query(
    `SELECT * FROM workflow_node_logs WHERE execution_id = $1 ORDER BY created_at ASC`,
    [executionId]
  );

  return {
    execution: execResult.rows[0],
    nodeLogs: logsResult.rows,
  };
}

