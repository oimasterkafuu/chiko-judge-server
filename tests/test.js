/**
 * 评测服务器完整测试脚本
 * 演示完整的评测流程，显示完整的请求和响应
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 从 .env 文件读取配置
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  return env;
}

const env = loadEnv();
const API_URL = `http://localhost:${env.JUDGE_PORT || 3235}`;
const TOKEN = env.JUDGE_TOKEN;

// ========== 工具函数 ==========

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function print(msg, color = '') {
  console.log(color ? `${color}${msg}${colors.reset}` : msg);
}

function printBox(title, content, color = colors.cyan) {
  const lines = content.split('\n');
  const width = Math.max(title.length + 4, ...lines.map(l => l.length + 4));
  const border = '─'.repeat(width);
  
  print(`┌${border}┐`, color);
  print(`│  ${title.padEnd(width - 2)}│`, color);
  print(`├${border}┤`, color);
  lines.forEach(line => {
    print(`│  ${line.padEnd(width - 2)}│`, color);
  });
  print(`└${border}┘`, color);
}

function printHeader(title) {
  const line = '═'.repeat(60);
  console.log();
  print(`╔${line}╗`, colors.cyan);
  print(`║${title.padEnd(58)}║`, colors.cyan);
  print(`╚${line}╝`, colors.cyan);
  console.log();
}

function printSection(title) {
  print(`\n  ▸ ${title}`, colors.bright + colors.yellow);
  print('  ' + '─'.repeat(50), colors.dim);
}

function printRequest(method, endpoint, body = null) {
  print(`\n  ${colors.bright}[REQUEST]${colors.reset} ${colors.cyan}${method}${colors.reset} ${endpoint}`, colors.bright);
  if (body) {
    print('  Body:', colors.dim);
    const jsonStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    jsonStr.split('\n').forEach(line => {
      print(`    ${line}`, colors.white);
    });
  }
}

function printResponse(response) {
  const statusColor = response.error ? colors.red : colors.green;
  print(`\n  ${colors.bright}[RESPONSE]${colors.reset}`, colors.bright);
  const jsonStr = JSON.stringify(response, null, 2);
  jsonStr.split('\n').forEach(line => {
    print(`    ${line}`, statusColor);
  });
}

function printSuccess(msg) {
  print(`  ✓ ${msg}`, colors.green);
}

function printError(msg) {
  print(`  ✗ ${msg}`, colors.red);
}

function printInfo(msg) {
  print(`  → ${msg}`, colors.yellow);
}

// HTTP 请求
async function request(method, endpoint, body = null, isMultipart = false) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    'X-Auth-Token': TOKEN,
  };
  
  let fetchOptions = { method, headers };
  
  if (body) {
    if (isMultipart) {
      fetchOptions.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
      printRequest(method, endpoint, body);
    }
  } else {
    printRequest(method, endpoint);
  }
  
  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  
  try {
    const json = JSON.parse(text);
    printResponse(json);
    return json;
  } catch {
    printResponse({ raw: text.substring(0, 200) + '...' });
    return { raw: text };
  }
}

// 轮询任务状态
async function pollTask(taskId, maxAttempts = 120) {
  printInfo(`Polling task ${taskId}...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    const result = await request('GET', `/task/${taskId}`);
    
    if (result.status === 'completed' || result.status === 'failed') {
      return result;
    }
    
    process.stdout.write(`\r  ${colors.yellow}Waiting... attempt ${i + 1}/${maxAttempts} (status: ${result.status})${colors.reset}`);
    await new Promise(r => setTimeout(r, 500));
  }
  
  process.stdout.write('\n');
  throw new Error('Task timeout');
}

// 上传文件（显示完整响应）
async function uploadFile(filePath, type) {
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);
  
  printRequest('POST', '/upload', `(multipart: file=${fileName}, type=${type})`);
  
  const formData = new FormData();
  formData.append('file', new Blob([fileContent]), fileName);
  formData.append('type', type);
  
  const url = `${API_URL}/upload`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-Auth-Token': TOKEN },
    body: formData,
  });
  
  const result = await response.json();
  printResponse(result);
  return result;
}

// ========== 测试函数 ==========

async function testHealthCheck() {
  printHeader('测试 1: 服务器健康检查');
  
  const health = await request('GET', '/health');
  
  if (health.status === 'ok') {
    printSuccess('服务器运行正常');
    return true;
  } else {
    printError('服务器异常');
    return false;
  }
}

async function testCorrectSolution() {
  printHeader('测试 2: A+B 正确解法');
  
  // 上传源代码
  printSection('上传源代码');
  const sourceResult = await uploadFile(
    path.join(__dirname, 'data/solution.cpp'),
    'source'
  );
  const sourceCacheId = sourceResult.cacheId;
  
  // 上传测试数据
  printSection('上传测试数据');
  const testCases = [
    { name: '1+2', input: 'input_1.txt', output: 'output_1.txt' },
    { name: '100+200', input: 'input_2.txt', output: 'output_2.txt' },
    { name: '-5+10', input: 'input_3.txt', output: 'output_3.txt' },
    { name: '0+0', input: 'input_4.txt', output: 'output_4.txt' },
    { name: '大数', input: 'input_5.txt', output: 'output_5.txt' },
  ];
  
  const uploadedCases = [];
  for (const tc of testCases) {
    const inputResult = await uploadFile(path.join(__dirname, 'data', tc.input), 'input');
    const outputResult = await uploadFile(path.join(__dirname, 'data', tc.output), 'output');
    uploadedCases.push({
      name: tc.name,
      inputCacheId: inputResult.cacheId,
      outputCacheId: outputResult.cacheId,
    });
  }
  
  // 编译
  printSection('编译源代码');
  const compileTask = await request('POST', '/compile', {
    sourceCacheId,
    language: 'cpp',
  });
  
  const compileResult = await pollTask(compileTask.taskId);
  
  if (!compileResult.result?.success) {
    printError('编译失败');
    return;
  }
  
  const binaryCacheId = compileResult.result.binaryCacheId;
  printSuccess(`编译成功，binaryCacheId: ${binaryCacheId}`);
  
  // 评测
  printSection('评测测试点');
  const results = [];
  
  for (const tc of uploadedCases) {
    const judgeTask = await request('POST', '/judge', {
      binaryCacheId,
      inputCacheId: tc.inputCacheId,
      outputCacheId: tc.outputCacheId,
      checkerName: 'ncmp',
      timeLimit: 1000,
      memoryLimit: 128 * 1024,
    });
    
    process.stdout.write('\r');
    const result = await pollTask(judgeTask.taskId);
    process.stdout.write('\r');
    
    results.push({ name: tc.name, ...result.result });
    
    const statusIcon = result.result?.status === 'accepted' ? '✓' : '✗';
    const statusColor = result.result?.status === 'accepted' ? colors.green : colors.red;
    print(`    ${statusIcon} ${tc.name}: ${result.result?.status} (score=${result.result?.score})`, statusColor);
  }
  
  // 汇总
  printSection('结果汇总');
  const totalScore = results.reduce((sum, r) => sum + (r.score || 0), 0);
  const maxScore = results.length * 100;
  print(`  总分: ${totalScore}/${maxScore}`, totalScore === maxScore ? colors.green : colors.yellow);
  
  return { binaryCacheId, uploadedCases };
}

async function testWrongSolution() {
  printHeader('测试 3: A+B 错误解法（观察错误处理）');
  
  // 上传错解源代码
  printSection('上传错解源代码');
  const sourceResult = await uploadFile(
    path.join(__dirname, 'data/solution_wrong.cpp'),
    'source'
  );
  const sourceCacheId = sourceResult.cacheId;
  
  // 复用之前上传的测试数据
  printSection('上传测试数据');
  const testCases = [
    { name: '1+2 (正确)', input: 'input_1.txt', output: 'output_1.txt' },
    { name: '100+200 (特判错误→400)', input: 'input_2.txt', output: 'output_2.txt' },
    { name: '-5+10 (死循环)', input: 'input_3.txt', output: 'output_3.txt', timeLimit: 500 },
    { name: '0+0 (除以零)', input: 'input_4.txt', output: 'output_4.txt' },
    { name: '大数 (正确)', input: 'input_5.txt', output: 'output_5.txt' },
  ];
  
  const uploadedCases = [];
  for (const tc of testCases) {
    const inputResult = await uploadFile(path.join(__dirname, 'data', tc.input), 'input');
    const outputResult = await uploadFile(path.join(__dirname, 'data', tc.output), 'output');
    uploadedCases.push({
      name: tc.name,
      inputCacheId: inputResult.cacheId,
      outputCacheId: outputResult.cacheId,
      timeLimit: tc.timeLimit || 1000,
    });
  }
  
  // 编译
  printSection('编译错解代码');
  const compileTask = await request('POST', '/compile', {
    sourceCacheId,
    language: 'cpp',
  });
  
  const compileResult = await pollTask(compileTask.taskId);
  
  if (!compileResult.result?.success) {
    printError('编译失败');
    return;
  }
  
  const binaryCacheId = compileResult.result.binaryCacheId;
  printSuccess(`编译成功`);
  
  // 评测
  printSection('评测测试点（观察各错误情况）');
  const results = [];
  
  for (const tc of uploadedCases) {
    print(`\n  ── ${tc.name} ──`, colors.cyan);
    
    const judgeTask = await request('POST', '/judge', {
      binaryCacheId,
      inputCacheId: tc.inputCacheId,
      outputCacheId: tc.outputCacheId,
      checkerName: 'ncmp',
      timeLimit: tc.timeLimit,
      memoryLimit: 128 * 1024,
    });
    
    process.stdout.write('\r');
    const result = await pollTask(judgeTask.taskId);
    process.stdout.write('\r');
    
    results.push({ name: tc.name, ...result.result });
    
    const status = result.result?.status;
    let statusColor = colors.green;
    let statusIcon = '✓';
    
    if (status === 'wrong-answer') {
      statusColor = colors.red;
      statusIcon = '✗';
    } else if (status === 'time-limit-exceeded') {
      statusColor = colors.yellow;
      statusIcon = '⏱';
    } else if (status === 'runtime-error') {
      statusColor = colors.magenta;
      statusIcon = '⚠';
    }
    
    print(`    ${statusIcon} 状态: ${status}`, statusColor);
    print(`    分数: ${result.result?.score || 0}`);
    print(`    时间: ${result.result?.time}ms`);
    if (result.result?.checkerMessage) {
      print(`    检查器: ${result.result.checkerMessage}`, colors.dim);
    }
    if (result.result?.output) {
      print(`    输出: ${result.result.output.trim()}`, colors.dim);
    }
  }
  
  // 汇总表格
  printSection('错误结果汇总表格');
  console.log('  ┌─────────────────────────────┬──────────────────┬───────┐');
  console.log('  │ 测试点                      │ 状态             │ 分数  │');
  console.log('  ├─────────────────────────────┼──────────────────┼───────┤');
  
  for (const r of results) {
    const status = r.status || 'unknown';
    const statusColor = status === 'accepted' ? colors.green :
                        status === 'wrong-answer' ? colors.red :
                        status === 'time-limit-exceeded' ? colors.yellow :
                        colors.magenta;
    const name = r.name.padEnd(27);
    console.log(`  │ ${name} │ ${statusColor}${status.padEnd(16)}${colors.reset} │ ${(r.score || 0).toString().padStart(5)} │`);
  }
  
  console.log('  └─────────────────────────────┴──────────────────┴───────┘');
}

async function testFileIO() {
  printHeader('测试 4: 文件输入输出功能');
  
  // 上传文件IO版本的程序
  printSection('上传文件IO程序');
  const sourceResult = await uploadFile(
    path.join(__dirname, 'data/solution_fileio.cpp'),
    'source'
  );
  const sourceCacheId = sourceResult.cacheId;
  
  // 上传输入输出文件
  printSection('上传测试数据');
  const inputResult = await uploadFile(
    path.join(__dirname, 'data/fileio_input.txt'),
    'input'
  );
  const outputResult = await uploadFile(
    path.join(__dirname, 'data/fileio_output.txt'),
    'output'
  );
  
  // 编译
  printSection('编译程序');
  const compileTask = await request('POST', '/compile', {
    sourceCacheId,
    language: 'cpp',
  });
  
  const compileResult = await pollTask(compileTask.taskId);
  
  if (!compileResult.result?.success) {
    printError('编译失败');
    return;
  }
  
  const binaryCacheId = compileResult.result.binaryCacheId;
  
  // 评测（文件IO模式）
  printSection('评测（文件IO模式）');
  printInfo('程序从 data.in 读取输入，输出到 data.out');
  
  const judgeTask = await request('POST', '/judge', {
    binaryCacheId,
    inputCacheId: inputResult.cacheId,
    outputCacheId: outputResult.cacheId,
    checkerName: 'ncmp',
    timeLimit: 1000,
    memoryLimit: 128 * 1024,
    isFileInput: true,
    inputFileName: 'data.in',
    outputFileName: 'data.out',
  });
  
  const result = await pollTask(judgeTask.taskId);
  
  printSuccess(`评测完成: ${result.result?.status}`);
  print(`  输入: 123 456`);
  print(`  期望输出: 579`);
  print(`  实际输出: ${result.result?.output?.trim()}`);
  print(`  分数: ${result.result?.score}`);
}

async function testInteractive() {
  printHeader('测试 5: 交互题评测（猜数字游戏）');
  
  // 上传用户程序
  printSection('上传用户程序');
  const userSourceResult = await uploadFile(
    path.join(__dirname, 'data/interactive_user.cpp'),
    'source'
  );
  
  // 上传交互器
  printSection('上传交互器程序');
  const interactorSourceResult = await uploadFile(
    path.join(__dirname, 'data/interactive_interactor.cpp'),
    'source'
  );
  
  // 上传交互器输入（目标数字）
  printSection('上传交互器输入文件');
  const inputResult = await uploadFile(
    path.join(__dirname, 'data/interactive_input.txt'),
    'input'
  );
  
  // 编译用户程序
  printSection('编译用户程序');
  const userCompileTask = await request('POST', '/compile', {
    sourceCacheId: userSourceResult.cacheId,
    language: 'cpp',
  });
  const userCompileResult = await pollTask(userCompileTask.taskId);
  const userBinaryCacheId = userCompileResult.result.binaryCacheId;
  
  // 编译交互器
  printSection('编译交互器程序');
  const interactorCompileTask = await request('POST', '/compile', {
    sourceCacheId: interactorSourceResult.cacheId,
    language: 'cpp',
  });
  const interactorCompileResult = await pollTask(interactorCompileTask.taskId);
  const interactorBinaryCacheId = interactorCompileResult.result.binaryCacheId;
  
  // 提交互互题评测
  printSection('提交交互题评测');
  printInfo('目标数字: 42，用户程序使用二分查找');
  
  const interactiveTask = await request('POST', '/interactive', {
    userBinaryCacheId,
    interactorBinaryCacheId,
    inputCacheId: inputResult.cacheId,
    timeLimit: 1000,
    memoryLimit: 128 * 1024,
    interactorTimeLimit: 5000,
    interactorMemoryLimit: 128 * 1024,
    scoreFileName: 'score.txt',
    messageFileName: 'message.txt',
  });
  
  const result = await pollTask(interactiveTask.taskId);
  
  printSuccess('交互题评测完成');
  print(`  判定结果: ${result.result?.verdict}`, result.result?.verdict === 'accepted' ? colors.green : colors.yellow);
  print(`  分数: ${result.result?.score}`);
  print(`  消息: ${result.result?.message}`);
  print(`  用户程序时间: ${result.result?.userTime}ms`);
  print(`  用户程序内存: ${Math.round((result.result?.userMemory || 0) / 1024)}MB`);
}

async function testServerStatus() {
  printHeader('测试 6: 服务器状态查询');
  
  const status = await request('GET', '/status');
  
  printSuccess('状态查询成功');
  print(`  队列大小: ${status.queue?.queueSize}`);
  print(`  处理中: ${status.queue?.isProcessing}`);
  print(`  缓存数量: ${status.cache?.count}`);
  print(`  缓存大小: ${status.cache?.totalSizeMB}MB`);
  print(`  运行时间: ${Math.round(status.uptime)}秒`);
}

async function testCustomChecker() {
  printHeader('测试 7: 自定义 Checker 评测');
  
  // 上传自定义 checker 源代码
  printSection('上传自定义 Checker 源代码');
  const checkerSourceResult = await uploadFile(
    path.join(__dirname, 'data/custom_checker.cpp'),
    'source'
  );
  const checkerSourceCacheId = checkerSourceResult.cacheId;
  
  // 编译自定义 checker
  printSection('编译自定义 Checker');
  printInfo('使用 /compile/checker 接口，自动引入 testlib.h');
  
  const checkerCompileTask = await request('POST', '/compile/checker', {
    sourceCacheId: checkerSourceCacheId,
    language: 'cpp',
  });
  
  const checkerCompileResult = await pollTask(checkerCompileTask.taskId);
  
  if (!checkerCompileResult.result?.success) {
    printError('Checker 编译失败');
    printInfo(checkerCompileResult.result?.compileInfo || checkerCompileResult.error);
    return;
  }
  
  const checkerCacheId = checkerCompileResult.result.checkerCacheId;
  printSuccess(`Checker 编译成功`);
  print(`  checkerCacheId: ${checkerCacheId}`, colors.green);
  
  // 上传测试数据
  printSection('上传测试数据');
  const inputResult = await uploadFile(
    path.join(__dirname, 'data/input_1.txt'),
    'input'
  );
  const outputResult = await uploadFile(
    path.join(__dirname, 'data/output_1.txt'),
    'output'
  );
  
  // 上传并编译正确的程序
  printSection('上传并编译测试程序');
  const sourceResult = await uploadFile(
    path.join(__dirname, 'data/solution.cpp'),
    'source'
  );
  
  const compileTask = await request('POST', '/compile', {
    sourceCacheId: sourceResult.cacheId,
    language: 'cpp',
  });
  
  const compileResult = await pollTask(compileTask.taskId);
  const binaryCacheId = compileResult.result.binaryCacheId;
  
  // 使用自定义 checker 评测
  printSection('使用自定义 Checker 评测');
  printInfo(`checkerName 使用 checkerCacheId: ${checkerCacheId}`);
  
  const judgeTask = await request('POST', '/judge', {
    binaryCacheId,
    inputCacheId: inputResult.cacheId,
    outputCacheId: outputResult.cacheId,
    checkerName: checkerCacheId,  // 使用 checkerCacheId 作为 checkerName
    timeLimit: 1000,
    memoryLimit: 128 * 1024,
  });
  
  const result = await pollTask(judgeTask.taskId);
  
  printSuccess('自定义 Checker 评测完成');
  print(`  状态: ${result.result?.status}`, result.result?.status === 'accepted' ? colors.green : colors.red);
  print(`  分数: ${result.result?.score}`);
  print(`  Checker 消息: ${result.result?.checkerMessage}`);
  
  // 测试错误情况
  printSection('测试 Checker 错误检测');
  
  // 创建一个错误输出
  const wrongOutput = '999\n';  // 错误的答案
  
  // 直接上传错误输出作为输出文件
  const wrongOutputResult = await uploadFile(
    path.join(__dirname, 'data/input_1.txt'),  // 临时用 input 作为文件
    'output'
  );
  
  // 但我们需要手动设置错误答案，这里简化处理
  // 直接用 input_2.txt 的输出（300）来对比 input_1.txt 的答案（3）
  const wrongAnswerResult = await uploadFile(
    path.join(__dirname, 'data/output_2.txt'),  // 答案是 300
    'output'
  );
  
  const wrongJudgeTask = await request('POST', '/judge', {
    binaryCacheId,
    inputCacheId: inputResult.cacheId,
    outputCacheId: wrongAnswerResult.cacheId,  // 使用错误的答案
    checkerName: checkerCacheId,
    timeLimit: 1000,
    memoryLimit: 128 * 1024,
  });
  
  const wrongResult = await pollTask(wrongJudgeTask.taskId);
  
  print(`  状态: ${wrongResult.result?.status}`, wrongResult.result?.status === 'wrong-answer' ? colors.yellow : colors.red);
  print(`  分数: ${wrongResult.result?.score}`);
  print(`  Checker 消息: ${wrongResult.result?.checkerMessage}`);
  
  if (wrongResult.result?.status === 'wrong-answer' && wrongResult.result?.score === 0) {
    printSuccess('Checker 正确识别了错误答案');
  }
}

// ========== 主函数 ==========

async function main() {
  console.log('\n' + '═'.repeat(60));
  print('       评测服务器完整测试流程', colors.bright + colors.magenta);
  print('       Complete Test Suite for Judge Server', colors.dim);
  console.log('═'.repeat(60));
  
  printInfo(`API URL: ${API_URL}`);
  printInfo(`Token: ${TOKEN.substring(0, 8)}...${TOKEN.substring(TOKEN.length - 4)}`);
  
  try {
    // 1. 健康检查
    const healthOk = await testHealthCheck();
    if (!healthOk) {
      process.exit(1);
    }
    
    // 2. 正确解法测试
    await testCorrectSolution();
    
    // 3. 错误解法测试
    await testWrongSolution();
    
    // 4. 文件IO测试
    await testFileIO();
    
    // 5. 交互题测试
    await testInteractive();
    
    // 6. 服务器状态
    await testServerStatus();
    
    // 7. 自定义 Checker 测试
    await testCustomChecker();
    
    // 完成
    console.log('\n' + '═'.repeat(60));
    print('  🎉 所有测试完成！', colors.green + colors.bright);
    console.log('═'.repeat(60) + '\n');
    
  } catch (error) {
    printError(`发生错误: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

main();