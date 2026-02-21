/**
 * API 路由
 */

import fs from 'fs';
import { cacheManager, CacheType } from '../utils/cache.js';
import { taskQueue, TaskType, TaskStatus } from '../utils/queue.js';
import {
  handleCompile,
  handleCompileChecker,
  handleJudge,
  handleRun,
  handleInteractive
} from '../utils/handlers.js';

// 注册任务处理器
taskQueue.registerHandler(TaskType.COMPILE, handleCompile);
taskQueue.registerHandler(TaskType.COMPILE_CHECKER, handleCompileChecker);
taskQueue.registerHandler(TaskType.JUDGE, handleJudge);
taskQueue.registerHandler(TaskType.RUN, handleRun);
taskQueue.registerHandler(TaskType.INTERACTIVE, handleInteractive);

/**
 * 鉴权中间件
 */
async function authMiddleware(request, reply) {
  const token = process.env.JUDGE_TOKEN;
  
  if (!token) {
    reply.code(500).send({ error: 'Server misconfigured: JUDGE_TOKEN not set' });
    return;
  }
  
  // 从 header 或 query 获取 token
  const clientToken = request.headers['x-auth-token'] || request.query.token;
  
  if (!clientToken || clientToken !== token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
}

/**
 * 注册路由
 */
export async function registerRoutes(fastify) {
  // 设置队列并发：从环境变量读取，默认 1
  const rawJudgeThreads = process.env.JUDGE_THREADS;
  const parsedJudgeThreads = Number.parseInt(rawJudgeThreads || '1', 10);
  const judgeThreads = Number.isNaN(parsedJudgeThreads) || parsedJudgeThreads < 1
    ? 1
    : parsedJudgeThreads;

  if (rawJudgeThreads && (Number.isNaN(parsedJudgeThreads) || parsedJudgeThreads < 1)) {
    fastify.log.warn(`Invalid JUDGE_THREADS="${rawJudgeThreads}", fallback to 1`);
  }
  taskQueue.setConcurrency(judgeThreads);

  // 注册 multipart 插件
  await fastify.register(import('@fastify/multipart'), {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
    }
  });
  
  // 注册 CORS
  await fastify.register(import('@fastify/cors'), {
    origin: true,
  });

  // ========== 文件上传接口 ==========
  
  /**
   * POST /upload
   * 上传文件到缓存
   * Body: multipart/form-data
   *   - file: 文件内容
   *   - type: 缓存类型 (source|input|output|checker)
   * Response: { cacheId, expiresIn }
   */
  fastify.post('/upload', { preHandler: authMiddleware }, async (request, reply) => {
    const parts = request.parts();
    let fileBuffer = null;
    let fileType = CacheType.SOURCE;
    let fileName = 'unknown';
    
    for await (const part of parts) {
      if (part.type === 'field') {
        if (part.fieldname === 'type') {
          fileType = part.value;
        }
      } else if (part.type === 'file') {
        fileName = part.filename;
        fileBuffer = await part.toBuffer();
      }
    }
    
    if (!fileBuffer) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }
    
    // 验证类型
    const validTypes = Object.values(CacheType);
    if (!validTypes.includes(fileType)) {
      return reply.code(400).send({ error: `Invalid type. Valid types: ${validTypes.join(', ')}` });
    }
    
    // 存储到缓存
    const cacheId = cacheManager.set(fileType, fileBuffer, { fileName });
    
    return {
      cacheId,
      fileName,
      type: fileType,
      size: fileBuffer.length,
      expiresIn: 300, // 5分钟
    };
  });

  // ========== 编译接口 ==========
  
  /**
   * POST /compile
   * 提交编译任务
   * Body: { sourceCacheId, language?, priority? }
   * Response: { taskId, status }
   */
  fastify.post('/compile', { preHandler: authMiddleware }, async (request, reply) => {
    const { sourceCacheId, language = 'cpp', priority = 0 } = request.body || {};
    
    if (!sourceCacheId) {
      return reply.code(400).send({ error: 'sourceCacheId is required' });
    }
    
    // 检查源代码缓存是否存在
    if (!cacheManager.has(sourceCacheId)) {
      return reply.code(400).send({ error: 'Source cache not found or expired' });
    }
    
    // 添加任务
    const taskId = taskQueue.addTask(TaskType.COMPILE, {
      sourceCacheId,
      language,
    }, priority);
    
    return {
      taskId,
      status: 'pending',
      message: 'Task submitted successfully',
    };
  });

  /**
   * POST /compile/checker
   * 提交自定义 checker 编译任务
   * Body: { sourceCacheId, language?, priority? }
   * Response: { taskId, status }
   * 
   * 说明：
   * - 编译时会自动引入 testlib.h
   * - 编译成功后返回 checkerCacheId，可在评测接口中作为 checkerName 使用
   * - checker 需要遵循 testlib 规范
   */
  fastify.post('/compile/checker', { preHandler: authMiddleware }, async (request, reply) => {
    const { sourceCacheId, language = 'cpp', priority = 0 } = request.body || {};
    
    if (!sourceCacheId) {
      return reply.code(400).send({ error: 'sourceCacheId is required' });
    }
    
    // 检查源代码缓存是否存在
    if (!cacheManager.has(sourceCacheId)) {
      return reply.code(400).send({ error: 'Checker source cache not found or expired' });
    }
    
    // 添加任务
    const taskId = taskQueue.addTask(TaskType.COMPILE_CHECKER, {
      sourceCacheId,
      language,
    }, priority);
    
    return {
      taskId,
      status: 'pending',
      message: 'Checker compile task submitted successfully',
    };
  });

  // ========== 评测接口 ==========
  
  /**
   * POST /judge
   * 提交评测任务
   * Body: {
   *   binaryCacheId, inputCacheId, outputCacheId,
   *   checkerName?, timeLimit?, memoryLimit?,
   *   isFileInput?, inputFileName?, outputFileName?, priority?
   * }
   * Response: { taskId, status }
   */
  fastify.post('/judge', { preHandler: authMiddleware }, async (request, reply) => {
    const {
      binaryCacheId,
      inputCacheId,
      outputCacheId,
      checkerName = 'icmp',
      timeLimit = 1000,
      memoryLimit = 128 * 1024,
      isFileInput = false,
      inputFileName = 'input.txt',
      outputFileName = 'output.txt',
      priority = 0,
    } = request.body || {};
    
    // 验证必填参数
    if (!binaryCacheId || !inputCacheId || !outputCacheId) {
      return reply.code(400).send({ 
        error: 'binaryCacheId, inputCacheId, outputCacheId are required' 
      });
    }
    
    // 检查缓存
    if (!cacheManager.has(binaryCacheId)) {
      return reply.code(400).send({ error: 'Binary cache not found or expired' });
    }
    if (!cacheManager.has(inputCacheId)) {
      return reply.code(400).send({ error: 'Input cache not found or expired' });
    }
    if (!cacheManager.has(outputCacheId)) {
      return reply.code(400).send({ error: 'Output cache not found or expired' });
    }
    
    // 添加任务
    const taskId = taskQueue.addTask(TaskType.JUDGE, {
      binaryCacheId,
      inputCacheId,
      outputCacheId,
      checkerName,
      timeLimit,
      memoryLimit,
      isFileInput,
      inputFileName,
      outputFileName,
    }, priority);
    
    return {
      taskId,
      status: 'pending',
      message: 'Task submitted successfully',
    };
  });

  // ========== 运行接口 ==========
  
  /**
   * POST /run
   * 提交运行任务
   * Body: {
   *   binaryCacheId, inputCacheId,
   *   timeLimit?, memoryLimit?,
   *   isFileInput?, inputFileName?, outputFileName?, priority?
   * }
   * Response: { taskId, status }
   */
  fastify.post('/run', { preHandler: authMiddleware }, async (request, reply) => {
    const {
      binaryCacheId,
      inputCacheId,
      timeLimit = 1000,
      memoryLimit = 128 * 1024,
      isFileInput = false,
      inputFileName = 'input.txt',
      outputFileName = 'output.txt',
      priority = 0,
    } = request.body || {};
    
    // 验证必填参数
    if (!binaryCacheId || !inputCacheId) {
      return reply.code(400).send({ 
        error: 'binaryCacheId and inputCacheId are required' 
      });
    }
    
    // 检查缓存
    if (!cacheManager.has(binaryCacheId)) {
      return reply.code(400).send({ error: 'Binary cache not found or expired' });
    }
    if (!cacheManager.has(inputCacheId)) {
      return reply.code(400).send({ error: 'Input cache not found or expired' });
    }
    
    // 添加任务
    const taskId = taskQueue.addTask(TaskType.RUN, {
      binaryCacheId,
      inputCacheId,
      timeLimit,
      memoryLimit,
      isFileInput,
      inputFileName,
      outputFileName,
    }, priority);
    
    return {
      taskId,
      status: 'pending',
      message: 'Task submitted successfully',
    };
  });

  // ========== 交互题评测接口 ==========
  
  /**
   * POST /interactive
   * 提交互互题评测任务
   * Body: {
   *   userBinaryCacheId, interactorBinaryCacheId,
   *   timeLimit?, memoryLimit?,
   *   interactorTimeLimit?, interactorMemoryLimit?,
   *   inputCacheId?, scoreFileName?, messageFileName?, priority?
   * }
   * Response: { taskId, status }
   */
  fastify.post('/interactive', { preHandler: authMiddleware }, async (request, reply) => {
    const {
      userBinaryCacheId,
      interactorBinaryCacheId,
      timeLimit = 1000,
      memoryLimit = 128 * 1024,
      interactorTimeLimit = 5000,
      interactorMemoryLimit = 128 * 1024,
      inputCacheId,
      scoreFileName = 'score.txt',
      messageFileName = 'message.txt',
      priority = 0,
    } = request.body || {};
    
    // 验证必填参数
    if (!userBinaryCacheId || !interactorBinaryCacheId) {
      return reply.code(400).send({ 
        error: 'userBinaryCacheId and interactorBinaryCacheId are required' 
      });
    }
    
    // 检查缓存
    if (!cacheManager.has(userBinaryCacheId)) {
      return reply.code(400).send({ error: 'User binary cache not found or expired' });
    }
    if (!cacheManager.has(interactorBinaryCacheId)) {
      return reply.code(400).send({ error: 'Interactor binary cache not found or expired' });
    }
    if (inputCacheId && !cacheManager.has(inputCacheId)) {
      return reply.code(400).send({ error: 'Input cache not found or expired' });
    }
    
    // 添加任务
    const taskId = taskQueue.addTask(TaskType.INTERACTIVE, {
      userBinaryCacheId,
      interactorBinaryCacheId,
      timeLimit,
      memoryLimit,
      interactorTimeLimit,
      interactorMemoryLimit,
      inputCacheId,
      scoreFileName,
      messageFileName,
    }, priority);
    
    return {
      taskId,
      status: 'pending',
      message: 'Task submitted successfully',
    };
  });

  // ========== 任务状态查询接口 ==========
  
  /**
   * GET /task/:taskId
   * 查询任务状态
   * Response: { taskId, type, status, result?, error?, ... }
   */
  fastify.get('/task/:taskId', { preHandler: authMiddleware }, async (request, reply) => {
    const { taskId } = request.params;
    
    const task = taskQueue.getTask(taskId);
    
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }
    
    const response = task.toJSON();
    
    return response;
  });

  // ========== 缓存下载接口 ==========
  
  /**
   * GET /cache/:cacheId
   * 下载缓存文件
   * Response: 文件内容
   */
  fastify.get('/cache/:cacheId', { preHandler: authMiddleware }, async (request, reply) => {
    const { cacheId } = request.params;
    
    const cache = cacheManager.get(cacheId);
    
    if (!cache) {
      return reply.code(404).send({ error: 'Cache not found or expired' });
    }
    
    const fileBuffer = fs.readFileSync(cache.filePath);
    const fileName = cache.metadata.fileName || cacheId;
    
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    reply.header('Content-Type', 'application/octet-stream');
    
    return fileBuffer;
  });

  // ========== 状态接口 ==========
  
  /**
   * GET /status
   * 获取服务器状态
   * Response: { queue, cache }
   */
  fastify.get('/status', { preHandler: authMiddleware }, async (request, reply) => {
    return {
      queue: taskQueue.getStatus(),
      cache: cacheManager.getStats(),
      uptime: process.uptime(),
    };
  });

  // ========== 健康检查 ==========
  
  /**
   * GET /health
   * 健康检查（无需鉴权）
   */
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: Date.now() };
  });
}
