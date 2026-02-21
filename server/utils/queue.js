/**
 * 任务队列管理模块
 * 支持优先级的任务队列，使用最小堆实现
 */

import { v4 as uuidv4 } from 'uuid';

// 任务状态
export const TaskStatus = {
  PENDING: 'pending',       // 等待中
  RUNNING: 'running',       // 执行中
  COMPLETED: 'completed',   // 已完成
  FAILED: 'failed',         // 失败
};

// 任务类型
export const TaskType = {
  COMPILE: 'compile',       // 编译程序
  COMPILE_CHECKER: 'compile-checker', // 编译自定义 checker
  JUDGE: 'judge',           // 普通评测
  RUN: 'run',               // 运行程序
  INTERACTIVE: 'interactive', // 交互题评测
};

/**
 * 任务类
 */
export class Task {
  constructor(type, data, priority = 0) {
    this.id = uuidv4();
    this.type = type;
    this.data = data;
    this.priority = priority;  // 数值越大优先级越高
    this.status = TaskStatus.PENDING;
    this.result = null;
    this.error = null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      priority: this.priority,
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }
}

/**
 * 最小堆（按优先级和创建时间排序）
 * 注意：我们使用负优先级来实现最大堆效果
 */
class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  // 比较函数：优先级高的在前，相同优先级时创建时间早的在前
  compare(a, b) {
    // 优先级降序（高的在前）
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // 创建时间升序（早的在前）
    return a.createdAt - b.createdAt;
  }

  push(task) {
    this.heap.push(task);
    this._siftUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    
    const top = this.heap[0];
    const last = this.heap.pop();
    
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this._siftDown(0);
    }
    
    return top;
  }

  peek() {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  size() {
    return this.heap.length;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _siftUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index], this.heap[parentIndex]) < 0) {
        [this.heap[index], this.heap[parentIndex]] = 
        [this.heap[parentIndex], this.heap[index]];
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  _siftDown(index) {
    const length = this.heap.length;
    
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      
      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }
      
      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = 
        [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else {
        break;
      }
    }
  }
}

/**
 * 任务队列管理器
 */
class TaskQueue {
  constructor(concurrency = 1) {
    this.queue = new PriorityQueue();
    this.tasks = new Map();  // id -> Task
    this.runningTasks = new Map(); // id -> Task
    this.activeWorkers = 0;
    this.concurrency = this.normalizeConcurrency(concurrency);
    this.handlers = new Map(); // 任务类型 -> 处理函数
  }

  normalizeConcurrency(value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return 1;
    }
    return parsed;
  }

  /**
   * 设置并发 worker 数
   */
  setConcurrency(value) {
    const nextConcurrency = this.normalizeConcurrency(value);

    if (nextConcurrency === this.concurrency) {
      return this.concurrency;
    }

    this.concurrency = nextConcurrency;
    console.log(`[Queue] Concurrency set to ${this.concurrency}`);

    // 并发提升后，立即尝试拉起更多任务
    this.process();

    return this.concurrency;
  }

  /**
   * 注册任务处理器
   */
  registerHandler(type, handler) {
    this.handlers.set(type, handler);
  }

  /**
   * 添加任务
   */
  addTask(type, data, priority = 0) {
    const task = new Task(type, data, priority);
    this.tasks.set(task.id, task);
    this.queue.push(task);
    
    console.log(`[Queue] Task ${task.id} added (type=${type}, priority=${priority})`);
    
    // 触发处理
    this.process();
    
    return task.id;
  }

  /**
   * 获取任务状态
   */
  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  /**
   * 处理队列
   */
  process() {
    while (this.activeWorkers < this.concurrency && !this.queue.isEmpty()) {
      const task = this.queue.pop();

      if (!task) break;

      this.activeWorkers += 1;
      this.runningTasks.set(task.id, task);
      task.status = TaskStatus.RUNNING;
      task.startedAt = Date.now();

      console.log(`[Queue] Processing task ${task.id} (type=${task.type}, workers=${this.activeWorkers}/${this.concurrency})`);

      this.executeTask(task)
        .catch((error) => {
          // 兜底保护，避免 Promise rejection 中断队列循环
          console.error(`[Queue] Unexpected error while processing task ${task.id}:`, error);
        })
        .finally(() => {
          this.activeWorkers = Math.max(0, this.activeWorkers - 1);
          this.runningTasks.delete(task.id);
          this.process();
        });
    }
  }

  async executeTask(task) {
    try {
      const handler = this.handlers.get(task.type);

      if (!handler) {
        throw new Error(`No handler registered for task type: ${task.type}`);
      }

      const result = await handler(task.data);

      task.status = TaskStatus.COMPLETED;
      task.result = result;
      task.completedAt = Date.now();

      console.log(`[Queue] Task ${task.id} completed in ${task.completedAt - task.startedAt}ms`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      task.status = TaskStatus.FAILED;
      task.error = errorMessage;
      task.completedAt = Date.now();

      console.error(`[Queue] Task ${task.id} failed:`, errorMessage);
    }
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    const runningTaskIds = Array.from(this.runningTasks.keys());

    return {
      queueSize: this.queue.size(),
      isProcessing: this.activeWorkers > 0,
      currentTask: runningTaskIds[0] || null, // 兼容旧字段
      runningTasks: runningTaskIds,
      activeWorkers: this.activeWorkers,
      concurrency: this.concurrency,
      totalTasks: this.tasks.size,
    };
  }

  /**
   * 清理已完成的任务（保留最近 1000 个）
   */
  cleanup() {
    const completed = [];
    this.tasks.forEach((task, id) => {
      if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED) {
        completed.push({ id, completedAt: task.completedAt });
      }
    });
    
    // 按完成时间排序，保留最新的 1000 个
    if (completed.length > 1000) {
      completed.sort((a, b) => b.completedAt - a.completedAt);
      const toRemove = completed.slice(1000);
      toRemove.forEach(({ id }) => this.tasks.delete(id));
      console.log(`[Queue] Cleaned up ${toRemove.length} old tasks`);
    }
  }
}

// 导出单例
export const taskQueue = new TaskQueue();

// 定期清理
setInterval(() => {
  taskQueue.cleanup();
}, 5 * 60 * 1000);
