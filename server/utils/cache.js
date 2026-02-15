/**
 * 缓存管理模块
 * 管理文件和二进制数据的缓存，支持 5 分钟过期
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// 缓存过期时间（毫秒）
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// 缓存存储目录
const CACHE_DIR = '/tmp/judge-cache';

// 缓存项类型
export const CacheType = {
  SOURCE: 'source',       // 源代码
  BINARY: 'binary',       // 可执行文件
  INPUT: 'input',         // 输入数据
  OUTPUT: 'output',       // 输出数据（答案）
  CHECKER: 'checker',     // 检查器
};

/**
 * 缓存项
 */
class CacheItem {
  constructor(id, type, filePath, metadata = {}) {
    this.id = id;
    this.type = type;
    this.filePath = filePath;
    this.metadata = metadata;  // 额外信息（如文件名、大小等）
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + CACHE_TTL;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }
}

/**
 * 缓存管理器
 */
class CacheManager {
  constructor() {
    this.cache = new Map();  // id -> CacheItem
    this.cleanupInterval = null;
    
    // 确保缓存目录存在
    this.ensureCacheDir();
    
    // 启动定期清理
    this.startCleanup();
  }

  ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    // 为每种类型创建子目录
    Object.values(CacheType).forEach(type => {
      const dir = path.join(CACHE_DIR, type);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 生成缓存 ID
   */
  generateId() {
    return uuidv4();
  }

  /**
   * 存储数据到缓存
   * @param {string} type - 缓存类型
   * @param {Buffer|string} data - 数据内容
   * @param {object} metadata - 元数据
   * @returns {string} 缓存 ID
   */
  set(type, data, metadata = {}) {
    const id = this.generateId();
    const fileName = metadata.fileName || id;
    const filePath = path.join(CACHE_DIR, type, id);
    
    // 写入文件
    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else {
      fs.writeFileSync(filePath, data, 'utf-8');
    }
    
    // 创建缓存项
    const item = new CacheItem(id, type, filePath, {
      ...metadata,
      fileName,
      size: Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf-8')
    });
    
    this.cache.set(id, item);
    
    return id;
  }

  /**
   * 从缓存获取数据
   * @param {string} id - 缓存 ID
   * @returns {object|null} 包含 data 和 metadata 的对象，或 null
   */
  get(id) {
    const item = this.cache.get(id);
    
    if (!item) {
      return null;
    }
    
    if (item.isExpired()) {
      this.delete(id);
      return null;
    }
    
    // 读取文件内容
    if (!fs.existsSync(item.filePath)) {
      this.delete(id);
      return null;
    }
    
    return {
      id: item.id,
      type: item.type,
      filePath: item.filePath,
      metadata: item.metadata,
      createdAt: item.createdAt,
      expiresAt: item.expiresAt
    };
  }

  /**
   * 获取缓存文件路径
   */
  getFilePath(id) {
    const item = this.get(id);
    return item ? item.filePath : null;
  }

  /**
   * 检查缓存是否存在
   */
  has(id) {
    const item = this.cache.get(id);
    if (!item) return false;
    if (item.isExpired()) {
      this.delete(id);
      return false;
    }
    return true;
  }

  /**
   * 删除缓存
   */
  delete(id) {
    const item = this.cache.get(id);
    if (item) {
      // 删除文件
      if (fs.existsSync(item.filePath)) {
        try {
          fs.unlinkSync(item.filePath);
        } catch (e) {
          // 忽略删除错误
        }
      }
      this.cache.delete(id);
    }
  }

  /**
   * 刷新缓存过期时间
   */
  refresh(id) {
    const item = this.cache.get(id);
    if (item && !item.isExpired()) {
      item.expiresAt = Date.now() + CACHE_TTL;
      return true;
    }
    return false;
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    let totalSize = 0;
    let count = 0;
    
    this.cache.forEach(item => {
      if (!item.isExpired()) {
        count++;
        totalSize += item.metadata.size || 0;
      }
    });
    
    return {
      count,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    const expiredIds = [];
    
    this.cache.forEach((item, id) => {
      if (item.isExpired()) {
        expiredIds.push(id);
      }
    });
    
    expiredIds.forEach(id => this.delete(id));
    
    if (expiredIds.length > 0) {
      console.log(`[Cache] Cleaned up ${expiredIds.length} expired items`);
    }
  }

  /**
   * 启动定期清理
   */
  startCleanup() {
    // 每分钟清理一次
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * 停止清理
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.forEach((_, id) => this.delete(id));
  }
}

// 导出单例
export const cacheManager = new CacheManager();
