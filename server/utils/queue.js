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
  constructor() {
    this.queue = new PriorityQueue();
    this.tasks = new Map();  // id -> Task
    this.running = null;     // 当前运行的任务
    this.isProcessing = false;
    this.handlers = new Map(); // 任务类型 -> 处理函数
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
  async process() {
    if (this.isProcessing) return;
    if (this.queue.isEmpty()) return;
    
    this.isProcessing = true;
    
    while (!this.queue.isEmpty()) {
      const task = this.queue.pop();
      
      if (!task) break;
      
      this.running = task;
      task.status = TaskStatus.RUNNING;
      task.startedAt = Date.now();
      
      console.log(`[Queue] Processing task ${task.id} (type=${task.type})`);
      
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
        task.status = TaskStatus.FAILED;
        task.error = error.message;
        task.completedAt = Date.now();
        
        console.error(`[Queue] Task ${task.id} failed:`, error.message);
      }
      
      this.running = null;
    }
    
    this.isProcessing = false;
  }

  /**
   * 获取队列状态
   */
  getStatus() {
    return {
      queueSize: this.queue.size(),
      isProcessing: this.isProcessing,
      currentTask: this.running ? this.running.id : null,
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
