/**
 * 评测服务器入口
 * 监听 3235 端口
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 加载 .env 文件
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../.env') });

import Fastify from 'fastify';

const PORT = process.env.JUDGE_PORT || 3235;
const HOST = process.env.JUDGE_HOST || '0.0.0.0';

// 创建 Fastify 实例
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
  bodyLimit: 100 * 1024 * 1024, // 100MB
});

// 全局错误处理
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  
  reply.code(statusCode).send({
    error: message,
    statusCode,
  });
});

// 启动服务器
async function start() {
  try {
    // 在 dotenv 生效后再加载路由，确保依赖模块读取到正确环境变量
    const { registerRoutes } = await import('./routes/index.js');

    // 注册路由
    await registerRoutes(fastify);
    
    // 启动监听
    await fastify.listen({ port: PORT, host: HOST });
    
    console.log(`
╔════════════════════════════════════════════════════════════╗
║               Judge Server Started                         ║
╠════════════════════════════════════════════════════════════╣
║  Listening: http://${HOST}:${PORT}
║  Health:    http://${HOST}:${PORT}/health
║  Auth:      X-Auth-Token header or ?token= query param
╚════════════════════════════════════════════════════════════╝
    `);
    
    // 检查 TOKEN
    if (!process.env.JUDGE_TOKEN) {
      console.warn('⚠️  WARNING: JUDGE_TOKEN not set! Server will reject all requests.');
    }
    
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// 优雅关闭
async function close(signal) {
  console.log(`\nReceived ${signal}, shutting down...`);
  try {
    await fastify.close();
    console.log('Server closed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => close('SIGINT'));
process.on('SIGTERM', () => close('SIGTERM'));

// 启动
start();
