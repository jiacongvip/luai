// Swagger/OpenAPI 文档配置
export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Nexus Agent Orchestrator API',
    version: '1.0.0',
    description: 'AI 智能体编排平台 API 文档',
    contact: {
      name: 'API Support',
      email: 'support@nexus-ai.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:3001/api',
      description: 'Development server',
    },
    {
      url: 'https://api.nexus-ai.com',
      description: 'Production server',
    },
  ],
  tags: [
    { name: 'Auth', description: '认证相关接口' },
    { name: 'Users', description: '用户管理' },
    { name: 'Agents', description: '智能体管理' },
    { name: 'Sessions', description: '会话管理' },
    { name: 'Messages', description: '消息管理' },
    { name: 'Billing', description: '计费系统' },
    { name: 'Workflows', description: '工作流编排' },
    { name: 'Files', description: '文件/知识库管理' },
    { name: 'Analytics', description: '数据分析' },
    { name: 'Export', description: '数据导入导出' },
  ],
  paths: {
    // ============================================
    // Auth
    // ============================================
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: '用户登录',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  password: { type: 'string', example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '登录成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          '401': { description: '认证失败' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: '用户注册',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 6 },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: '注册成功' },
          '400': { description: '参数错误' },
        },
      },
    },

    // ============================================
    // Agents
    // ============================================
    '/agents': {
      get: {
        tags: ['Agents'],
        summary: '获取智能体列表',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Agent' },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Agents'],
        summary: '创建智能体',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AgentInput' },
            },
          },
        },
        responses: {
          '201': { description: '创建成功' },
        },
      },
    },

    // ============================================
    // Sessions
    // ============================================
    '/sessions': {
      get: {
        tags: ['Sessions'],
        summary: '获取会话列表',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Session' },
                },
              },
            },
          },
        },
      },
    },

    // ============================================
    // Messages
    // ============================================
    '/messages/send': {
      post: {
        tags: ['Messages'],
        summary: '发送消息（流式响应）',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sessionId', 'content'],
                properties: {
                  sessionId: { type: 'string' },
                  content: { type: 'string' },
                  agentId: { type: 'string' },
                  style: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE 流式响应',
            content: {
              'text/event-stream': {
                schema: { type: 'string' },
              },
            },
          },
        },
      },
    },

    // ============================================
    // Billing
    // ============================================
    '/billing/balance': {
      get: {
        tags: ['Billing'],
        summary: '获取用户余额',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    credits: { type: 'number' },
                    subscription: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/billing/recharge': {
      post: {
        tags: ['Billing'],
        summary: '创建充值订单',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['paymentMethod', 'amount', 'credits'],
                properties: {
                  planId: { type: 'string' },
                  paymentMethod: { type: 'string', enum: ['alipay', 'wechat', 'stripe'] },
                  amount: { type: 'number' },
                  credits: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '订单创建成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    orderId: { type: 'string' },
                    paymentInfo: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ============================================
    // Workflows
    // ============================================
    '/workflows': {
      get: {
        tags: ['Workflows'],
        summary: '获取工作流列表',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: '成功',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Workflow' },
                },
              },
            },
          },
        },
      },
    },
    '/workflows/{id}/execute': {
      post: {
        tags: ['Workflows'],
        summary: '执行工作流',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['input'],
                properties: {
                  input: { type: 'string' },
                  projectData: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '执行结果',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    output: { type: 'any' },
                    executionId: { type: 'string' },
                    nodeResults: { type: 'array' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ============================================
    // Files
    // ============================================
    '/files/upload': {
      post: {
        tags: ['Files'],
        summary: '上传文件',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fileName', 'fileContent'],
                properties: {
                  fileName: { type: 'string' },
                  fileType: { type: 'string' },
                  fileContent: { type: 'string', description: 'Base64 encoded content' },
                  projectId: { type: 'string' },
                  agentId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '上传成功' },
        },
      },
    },
    '/files/search': {
      post: {
        tags: ['Files'],
        summary: '知识库检索（RAG）',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['query'],
                properties: {
                  query: { type: 'string' },
                  projectId: { type: 'string' },
                  agentId: { type: 'string' },
                  limit: { type: 'integer', default: 5 },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: '检索结果',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          content: { type: 'string' },
                          fileName: { type: 'string' },
                          similarity: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ============================================
    // Export
    // ============================================
    '/export/create': {
      post: {
        tags: ['Export'],
        summary: '创建导出任务',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['exportType'],
                properties: {
                  exportType: { type: 'string', enum: ['sessions', 'messages', 'agents', 'projects', 'all'] },
                  format: { type: 'string', enum: ['json', 'csv'], default: 'json' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '任务创建成功' },
        },
      },
    },
    '/export/import': {
      post: {
        tags: ['Export'],
        summary: '导入数据',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['importType', 'data'],
                properties: {
                  importType: { type: 'string', enum: ['sessions', 'agents', 'projects', 'all'] },
                  data: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '导入成功' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          credits: { type: 'number' },
          avatar: { type: 'string' },
          role: { type: 'string', enum: ['user', 'admin'] },
          status: { type: 'string', enum: ['active', 'suspended'] },
        },
      },
      Agent: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          role: { type: 'string' },
          roleZh: { type: 'string' },
          description: { type: 'string' },
          descriptionZh: { type: 'string' },
          avatar: { type: 'string' },
          pricePerMessage: { type: 'number' },
          category: { type: 'string' },
          systemPrompt: { type: 'string' },
          styles: { type: 'array', items: { type: 'string' } },
          isPublic: { type: 'boolean' },
        },
      },
      AgentInput: {
        type: 'object',
        required: ['name', 'systemPrompt'],
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          roleZh: { type: 'string' },
          description: { type: 'string' },
          descriptionZh: { type: 'string' },
          avatar: { type: 'string' },
          pricePerMessage: { type: 'number', default: 5 },
          category: { type: 'string', default: 'General' },
          systemPrompt: { type: 'string' },
          styles: { type: 'array', items: { type: 'string' } },
          isPublic: { type: 'boolean', default: false },
        },
      },
      Session: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          lastMessage: { type: 'string' },
          isGroup: { type: 'boolean' },
          participants: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Workflow: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          nodes: { type: 'array' },
          edges: { type: 'array' },
          status: { type: 'string', enum: ['draft', 'published'] },
        },
      },
    },
  },
};

