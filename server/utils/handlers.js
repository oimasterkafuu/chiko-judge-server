/**
 * 任务处理器
 * 处理不同类型的评测任务
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ChikoJudgeSandbox } from 'chiko-judge-sandbox';
import { cacheManager, CacheType } from './cache.js';

// testlib 检查器列表
const TESTLIB_CHECKERS = [
  'icmp', 'ncmp', 'wcmp', 'rcmp', 'dcmp', 'fcmp', 'hcmp', 'lcmp',
  'uncmp', 'caseicmp', 'casencmp', 'casewcmp', 'yesno', 'nyesno',
  'rcmp4', 'rcmp6', 'rcmp9', 'rncmp', 'acmp'
];

// UUID 正则表达式，用于识别自定义 checker
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 判断是否为自定义 checker（UUID 格式）
 */
function isCustomChecker(checkerName) {
  return UUID_REGEX.test(checkerName);
}

/**
 * 编译自定义 Checker 任务处理器
 */
export async function handleCompileChecker(data) {
  const { sourceCacheId, language = 'cpp' } = data;
  
  // 获取源代码
  const sourceCache = cacheManager.get(sourceCacheId);
  if (!sourceCache) {
    throw new Error('Checker source code cache not found or expired');
  }
  
  const sourceCode = fs.readFileSync(sourceCache.filePath, 'utf-8');
  
  // 编译 checker（使用 isChecker: true 以获取 testlib.h）
  const compileResult = await ChikoJudgeSandbox.compile({
    sourceCode,
    language,
    submissionId: `checker_${Date.now()}`,
    isChecker: true  // 这会自动复制 testlib.h
  });
  
  if (!compileResult.success) {
    return {
      success: false,
      compileInfo: compileResult.compileInfo,
    };
  }
  
  // 将 checker 可执行文件缓存
  const executableBuffer = fs.readFileSync(compileResult.executablePath);
  const checkerCacheId = cacheManager.set(CacheType.CHECKER, executableBuffer, {
    originalSource: sourceCacheId,
    language,
    isCustomChecker: true,
  });
  
  // 清理临时目录
  ChikoJudgeSandbox.cleanupTempDir(compileResult.tempDir);
  
  return {
    success: true,
    checkerCacheId,
    compileInfo: compileResult.compileInfo,
  };
}

/**
 * 获取 checker 路径
 * 如果是内置 checker，使用 compileChecker 编译
 * 如果是自定义 checker（UUID），从缓存获取
 */
async function getCheckerPath(checkerName) {
  if (isCustomChecker(checkerName)) {
    // 自定义 checker，从缓存获取
    const checkerCache = cacheManager.get(checkerName);
    if (!checkerCache) {
      throw new Error(`Custom checker cache not found or expired: ${checkerName}`);
    }
    return checkerCache.filePath;
  } else {
    // 内置 checker，使用 compileChecker
    return await ChikoJudgeSandbox.compileChecker(checkerName);
  }
}

/**
 * 判断 checker 是否使用 testlib
 */
function isTestlibChecker(checkerName) {
  if (isCustomChecker(checkerName)) {
    // 自定义 checker 默认使用 testlib（因为我们编译时传入了 isChecker: true）
    return true;
  }
  return TESTLIB_CHECKERS.includes(checkerName);
}

/**
 * 创建并返回唯一的临时目录
 */
function createUniqueTempDir(prefix) {
  const tempDir = path.join('/tmp', `${prefix}-${Date.now()}-${randomUUID()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

/**
 * 编译任务处理器
 */
export async function handleCompile(data) {
  const { sourceCacheId, language = 'cpp' } = data;
  
  // 获取源代码
  const sourceCache = cacheManager.get(sourceCacheId);
  if (!sourceCache) {
    throw new Error('Source code cache not found or expired');
  }
  
  const sourceCode = fs.readFileSync(sourceCache.filePath, 'utf-8');
  
  // 编译
  const compileResult = await ChikoJudgeSandbox.compile({
    sourceCode,
    language,
    submissionId: `compile_${Date.now()}`
  });
  
  if (!compileResult.success) {
    return {
      success: false,
      compileInfo: compileResult.compileInfo,
    };
  }
  
  // 将可执行文件缓存
  const executableBuffer = fs.readFileSync(compileResult.executablePath);
  const binaryCacheId = cacheManager.set(CacheType.BINARY, executableBuffer, {
    originalSource: sourceCacheId,
    language,
  });
  
  // 清理临时目录
  ChikoJudgeSandbox.cleanupTempDir(compileResult.tempDir);
  
  return {
    success: true,
    binaryCacheId,
    compileInfo: compileResult.compileInfo,
  };
}

/**
 * 评测任务处理器
 */
export async function handleJudge(data) {
  const {
    binaryCacheId,
    inputCacheId,
    outputCacheId,      // 标准答案
    checkerName = 'icmp',
    timeLimit = 1000,
    memoryLimit = 128 * 1024,
    isFileInput = false,
    inputFileName = 'input.txt',
    outputFileName = 'output.txt',
  } = data;
  
  // 获取缓存文件
  const binaryCache = cacheManager.get(binaryCacheId);
  const inputCache = cacheManager.get(inputCacheId);
  const outputCache = cacheManager.get(outputCacheId);
  
  if (!binaryCache) throw new Error('Binary cache not found or expired');
  if (!inputCache) throw new Error('Input cache not found or expired');
  if (!outputCache) throw new Error('Output cache not found or expired');
  
  // 创建临时目录
  const tempDir = createUniqueTempDir('judge');
  
  try {
    // 写入可执行文件
    const execPath = path.join(tempDir, 'program');
    fs.writeFileSync(execPath, fs.readFileSync(binaryCache.filePath));
    fs.chmodSync(execPath, '755');
    
    // 写入输入文件
    const inputPath = path.join(tempDir, 'input.txt');
    fs.copyFileSync(inputCache.filePath, inputPath);
    
    // 写入答案文件
    const answerPath = path.join(tempDir, 'answer.txt');
    fs.copyFileSync(outputCache.filePath, answerPath);
    
    // 运行程序
    const runResult = await ChikoJudgeSandbox.runProgram({
      executablePath: execPath,
      inputPath,
      language: 'cpp',
      timeLimit,
      memoryLimit,
      isFileInput,
      inputFileName,
      outputFileName,
    });
    
    // 检查运行状态
    let status = 'accepted';
    if (runResult.result.status !== 1 || runResult.result.code !== 0) {
      if (runResult.result.status === 2) {
        status = 'time-limit-exceeded';
      } else if (runResult.result.status === 3) {
        status = 'memory-limit-exceeded';
      } else {
        status = 'runtime-error';
      }
      
      return {
        status,
        time: runResult.result.time,
        memory: runResult.result.memory,
        output: runResult.output,
        error: runResult.error,
      };
    }
    
    // 写入输出文件
    const outputPath = path.join(tempDir, 'output.txt');
    fs.writeFileSync(outputPath, runResult.output);
    
    // 获取 checker 路径（支持内置和自定义 checker）
    const checkerPath = await getCheckerPath(checkerName);
    
    // 运行检查器
    const useTestlib = isTestlibChecker(checkerName);
    const checkerResult = await ChikoJudgeSandbox.runChecker({
      checkerPath,
      inputPath,
      outputPath,
      answerPath,
      useTestlib,
    });
    
    // 确定状态
    if (checkerResult.normalizedScore >= 1) {
      status = 'accepted';
    } else if (checkerResult.normalizedScore > 0) {
      status = 'partial-accepted';
    } else {
      status = 'wrong-answer';
    }
    
    return {
      status,
      score: checkerResult.score,
      normalizedScore: checkerResult.normalizedScore,
      time: runResult.result.time,
      memory: runResult.result.memory,
      output: runResult.output,
      checkerMessage: checkerResult.message,
    };
    
  } finally {
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * 运行任务处理器
 */
export async function handleRun(data) {
  const {
    binaryCacheId,
    inputCacheId,
    timeLimit = 1000,
    memoryLimit = 128 * 1024,
    isFileInput = false,
    inputFileName = 'input.txt',
    outputFileName = 'output.txt',
  } = data;
  
  // 获取缓存文件
  const binaryCache = cacheManager.get(binaryCacheId);
  const inputCache = cacheManager.get(inputCacheId);
  
  if (!binaryCache) throw new Error('Binary cache not found or expired');
  if (!inputCache) throw new Error('Input cache not found or expired');
  
  // 创建临时目录
  const tempDir = createUniqueTempDir('run');
  
  try {
    // 写入可执行文件
    const execPath = path.join(tempDir, 'program');
    fs.writeFileSync(execPath, fs.readFileSync(binaryCache.filePath));
    fs.chmodSync(execPath, '755');
    
    // 写入输入文件
    const inputPath = path.join(tempDir, 'input.txt');
    fs.copyFileSync(inputCache.filePath, inputPath);
    
    // 运行程序
    const runResult = await ChikoJudgeSandbox.runProgram({
      executablePath: execPath,
      inputPath,
      language: 'cpp',
      timeLimit,
      memoryLimit,
      isFileInput,
      inputFileName,
      outputFileName,
    });
    
    // 检查运行状态
    let status = 'exited-normally';
    if (runResult.result.status !== 1) {
      if (runResult.result.status === 2) {
        status = 'time-limit-exceeded';
      } else if (runResult.result.status === 3) {
        status = 'memory-limit-exceeded';
      } else {
        status = 'runtime-error';
      }
    } else if (runResult.result.code !== 0) {
      status = 'non-zero-exit';
    }
    
    return {
      status,
      exitCode: runResult.result.code,
      time: runResult.result.time,
      memory: runResult.result.memory,
      output: runResult.output,
      error: runResult.error,
    };
    
  } finally {
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * 交互题评测任务处理器
 */
export async function handleInteractive(data) {
  const {
    userBinaryCacheId,
    interactorBinaryCacheId,
    timeLimit = 1000,
    memoryLimit = 128 * 1024,
    interactorTimeLimit = 5000,
    interactorMemoryLimit = 128 * 1024,
    inputCacheId,          // 可选：交互器的输入文件
    scoreFileName = 'score.txt',
    messageFileName = 'message.txt',
  } = data;
  
  // 获取缓存文件
  const userBinaryCache = cacheManager.get(userBinaryCacheId);
  const interactorBinaryCache = cacheManager.get(interactorBinaryCacheId);
  
  if (!userBinaryCache) throw new Error('User binary cache not found or expired');
  if (!interactorBinaryCache) throw new Error('Interactor binary cache not found or expired');
  
  // 创建临时目录
  const tempDir = createUniqueTempDir('interactive');
  
  try {
    // 写入可执行文件
    const userExecPath = path.join(tempDir, 'user');
    const interactorExecPath = path.join(tempDir, 'interactor');
    
    fs.writeFileSync(userExecPath, fs.readFileSync(userBinaryCache.filePath));
    fs.chmodSync(userExecPath, '755');
    
    fs.writeFileSync(interactorExecPath, fs.readFileSync(interactorBinaryCache.filePath));
    fs.chmodSync(interactorExecPath, '755');
    
    // 准备选项
    const options = {
      userExecutablePath: userExecPath,
      interactorExecutablePath: interactorExecPath,
      userLanguage: 'cpp',
      interactorLanguage: 'cpp',
      timeLimit,
      memoryLimit,
      interactorTimeLimit,
      interactorMemoryLimit,
      scoreFileName,
      messageFileName,
    };
    
    // 如果有输入文件
    if (inputCacheId) {
      const inputCache = cacheManager.get(inputCacheId);
      if (inputCache) {
        options.interactorInputPath = inputCache.filePath;
        options.interactorInputFileName = 'input.txt';
      }
    }
    
    // 运行交互
    const result = await ChikoJudgeSandbox.runInteractive(options);
    
    return {
      verdict: result.verdict.verdict,
      score: result.verdict.score,
      normalizedScore: result.verdict.normalizedScore,
      message: result.verdict.message,
      reason: result.verdict.reason,
      userTime: result.userResult.result.time,
      userMemory: result.userResult.result.memory,
      interactorTime: result.interactorResult.result.time,
      interactorMemory: result.interactorResult.result.memory,
      userError: result.userResult.error,
      interactorError: result.interactorResult.error,
    };
    
  } finally {
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
