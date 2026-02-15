/**
 * 评测机原型 - 基于 chiko-judge-sandbox
 * 支持传统题评测：编译 -> 运行 -> SPJ
 */

import fs from 'fs';
import path from 'path';
import { ChikoJudgeSandbox } from 'chiko-judge-sandbox';

// testlib 检查器列表
const TESTLIB_CHECKERS = [
  'icmp', 'ncmp', 'wcmp', 'rcmp', 'dcmp', 'fcmp', 'hcmp', 'lcmp',
  'uncmp', 'caseicmp', 'casencmp', 'casewcmp', 'yesno', 'nyesno',
  'rcmp4', 'rcmp6', 'rcmp9', 'rncmp', 'acmp'
];

/**
 * 获取运行状态描述
 */
function getJudgeStatus(result) {
  if (result.status === 1) {
    return result.code === 0 ? 'accepted' : 'runtime-error';
  } else if (result.status === 2) {
    return 'time-limit-exceeded';
  } else if (result.status === 3) {
    return 'memory-limit-exceeded';
  } else {
    return 'runtime-error';
  }
}

/**
 * 评测结果类
 */
export class JudgeResult {
  constructor(options = {}) {
    this.status = options.status || 'unknown';  // accepted, wrong-answer, compile-error, runtime-error, tle, mle
    this.score = options.score ?? 0;            // 分数 0-100
    this.time = options.time || 0;              // 运行时间
    this.memory = options.memory || 0;          // 内存使用
    this.output = options.output || '';         // 程序输出
    this.error = options.error || '';           // 错误信息
    this.message = options.message || '';       // 检查器信息
    this.compileInfo = options.compileInfo || ''; // 编译信息
  }
}

/**
 * 测试点类
 */
export class TestCase {
  constructor(options = {}) {
    this.input = options.input || '';
    this.output = options.output || '';
    this.timeLimit = options.timeLimit || 1000;     // ms
    this.memoryLimit = options.memoryLimit || 128 * 1024; // KB (128MB)
    this.score = options.score || 100;              // 该测试点分数
  }
}

/**
 * 评测机类
 */
export class Judge {
  constructor(options = {}) {
    this.checkerName = options.checkerName || 'icmp';
    this.language = options.language || 'cpp';
    this.timeLimit = options.timeLimit || 1000;     // ms
    this.memoryLimit = options.memoryLimit || 128 * 1024; // KB
  }

  /**
   * 编译用户代码
   */
  async compile(sourceCode, submissionId) {
    const result = await ChikoJudgeSandbox.compile({
      sourceCode,
      language: this.language,
      submissionId: submissionId || `judge_${Date.now()}`
    });

    return result;
  }

  /**
   * 运行程序
   */
  async run(executablePath, inputPath, options = {}) {
    const timeLimit = options.timeLimit || this.timeLimit;
    const memoryLimit = options.memoryLimit || this.memoryLimit;

    const result = await ChikoJudgeSandbox.runProgram({
      executablePath,
      inputPath,
      language: this.language,
      timeLimit,
      memoryLimit
    });

    return result;
  }

  /**
   * 运行检查器
   */
  async check(checkerPath, inputPath, outputPath, answerPath) {
    const useTestlib = TESTLIB_CHECKERS.includes(this.checkerName);

    const result = await ChikoJudgeSandbox.runChecker({
      checkerPath,
      inputPath,
      outputPath,
      answerPath,
      useTestlib
    });

    return result;
  }

  /**
   * 完整评测流程
   * @param {string} sourceCode - 源代码
   * @param {TestCase[]} testCases - 测试用例数组
   * @param {string} submissionId - 提交 ID
   * @returns {Promise<{results: JudgeResult[], totalScore: number, status: string}>}
   */
  async judge(sourceCode, testCases, submissionId) {
    console.log('=== 开始评测 ===');
    console.log(`提交 ID: ${submissionId}`);
    console.log(`检查器: ${this.checkerName}`);
    console.log(`测试点数量: ${testCases.length}`);

    // 1. 编译代码
    console.log('\n[1] 编译代码...');
    const compileResult = await this.compile(sourceCode, submissionId);

    if (!compileResult.success) {
      console.log('编译失败');
      return {
        results: [new JudgeResult({
          status: 'compile-error',
          compileInfo: compileResult.compileInfo
        })],
        totalScore: 0,
        status: 'compile-error'
      };
    }
    console.log('编译成功');

    // 2. 编译检查器
    console.log('\n[2] 编译检查器...');
    const checkerPath = await ChikoJudgeSandbox.compileChecker(this.checkerName);
    console.log('检查器编译成功');

    const results = [];
    let totalScore = 0;
    let maxScore = 0;

    // 3. 运行每个测试点
    console.log('\n[3] 开始测试点评测...');

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const testNum = i + 1;
      maxScore += testCase.score;

      console.log(`\n--- 测试点 ${testNum} ---`);
      console.log(`输入: "${testCase.input.trim()}"`);
      console.log(`期望: "${testCase.output.trim()}"`);

      // 准备文件
      const inputPath = path.join(compileResult.tempDir, 'data', `input_${i}.txt`);
      const answerPath = path.join(compileResult.tempDir, 'data', `answer_${i}.txt`);
      const outputPath = path.join(compileResult.tempDir, 'data', `output_${i}.txt`);

      fs.mkdirSync(path.dirname(inputPath), { recursive: true });
      fs.writeFileSync(inputPath, testCase.input);
      fs.writeFileSync(answerPath, testCase.output);

      // 运行程序
      const runResult = await this.run(
        compileResult.executablePath,
        inputPath,
        {
          timeLimit: testCase.timeLimit,
          memoryLimit: testCase.memoryLimit
        }
      );

      console.log(`运行时间: ${runResult.result.time}ms`);
      console.log(`内存使用: ${Math.round(runResult.result.memory / 1024)}MB`);
      console.log(`程序输出: "${runResult.output.trim()}"`);

      // 检查运行状态
      if (runResult.result.status !== 1 || runResult.result.code !== 0) {
        const status = getJudgeStatus(runResult.result);
        console.log(`状态: ${status}`);

        results.push(new JudgeResult({
          status,
          time: runResult.result.time,
          memory: runResult.result.memory,
          output: runResult.output,
          error: runResult.error
        }));
        continue;
      }

      // 写入输出文件
      fs.writeFileSync(outputPath, runResult.output);

      // 运行检查器
      const checkerResult = await this.check(
        checkerPath,
        inputPath,
        outputPath,
        answerPath
      );

      // 计算得分
      const testScore = Math.round(testCase.score * checkerResult.normalizedScore);
      totalScore += testScore;

      let status = 'partial-accepted';
      if (checkerResult.normalizedScore >= 1) {
        status = 'accepted';
      } else if (checkerResult.normalizedScore <= 0) {
        status = 'wrong-answer';
      }

      console.log(`状态: ${status} (score=${testScore}/${testCase.score})`);
      if (checkerResult.message) {
        console.log(`检查器信息: ${checkerResult.message}`);
      }

      results.push(new JudgeResult({
        status,
        score: testScore,
        time: runResult.result.time,
        memory: runResult.result.memory,
        output: runResult.output,
        message: checkerResult.message
      }));
    }

    // 4. 清理临时文件
    console.log('\n[4] 清理临时文件...');
    ChikoJudgeSandbox.cleanupTempDir(compileResult.tempDir);

    // 5. 汇总结果
    const finalStatus = totalScore >= maxScore ? 'accepted' : 
                        totalScore > 0 ? 'partial-accepted' : 'wrong-answer';

    console.log('\n=== 评测结果汇总 ===');
    console.log(`总得分: ${totalScore}/${maxScore}`);
    console.log(`最终状态: ${finalStatus}`);

    return {
      results,
      totalScore,
      maxScore,
      status: finalStatus
    };
  }
}

/**
 * 交互题测试点类
 */
export class InteractiveTestCase {
  constructor(options = {}) {
    this.interactorSource = options.interactorSource || '';  // 交互器源代码
    this.input = options.input || '';                        // 交互器输入（可选）
    this.timeLimit = options.timeLimit || 1000;              // ms
    this.memoryLimit = options.memoryLimit || 128 * 1024;    // KB
    this.interactorTimeLimit = options.interactorTimeLimit || 5000;  // 交互器时间限制
    this.interactorMemoryLimit = options.interactorMemoryLimit || 128 * 1024;  // 交互器内存限制
    this.score = options.score || 100;                       // 该测试点分数
    this.scoreFileName = options.scoreFileName || 'score.txt';
    this.messageFileName = options.messageFileName || 'message.txt';
  }
}

/**
 * 交互题评测结果类
 */
export class InteractiveJudgeResult {
  constructor(options = {}) {
    this.status = options.status || 'unknown';
    this.score = options.score ?? 0;
    this.time = options.time || 0;
    this.memory = options.memory || 0;
    this.message = options.message || '';
    this.error = options.error || '';
    this.compileInfo = options.compileInfo || '';
  }
}

/**
 * 交互题评测机类
 */
export class InteractiveJudge {
  constructor(options = {}) {
    this.language = options.language || 'cpp';
    this.timeLimit = options.timeLimit || 1000;
    this.memoryLimit = options.memoryLimit || 128 * 1024;
    this.interactorLanguage = options.interactorLanguage || 'cpp';
    this.interactorTimeLimit = options.interactorTimeLimit || 5000;
    this.interactorMemoryLimit = options.interactorMemoryLimit || 128 * 1024;
  }

  /**
   * 编译代码
   */
  async compile(sourceCode, submissionId) {
    return await ChikoJudgeSandbox.compile({
      sourceCode,
      language: this.language,
      submissionId: submissionId || `interactive_${Date.now()}`
    });
  }

  /**
   * 运行交互题单次测试
   */
  async runInteractive(userExecutablePath, interactorExecutablePath, testCase, tempDir) {
    const options = {
      userExecutablePath,
      interactorExecutablePath,
      userLanguage: this.language,
      interactorLanguage: this.interactorLanguage,
      timeLimit: testCase.timeLimit || this.timeLimit,
      memoryLimit: testCase.memoryLimit || this.memoryLimit,
      interactorTimeLimit: testCase.interactorTimeLimit || this.interactorTimeLimit,
      interactorMemoryLimit: testCase.interactorMemoryLimit || this.interactorMemoryLimit,
      scoreFileName: testCase.scoreFileName || 'score.txt',
      messageFileName: testCase.messageFileName || 'message.txt'
    };

    // 如果有输入文件，设置交互器输入
    if (testCase.input) {
      const inputPath = path.join(tempDir, 'interactive_input.txt');
      fs.mkdirSync(tempDir, { recursive: true });
      fs.writeFileSync(inputPath, testCase.input);
      options.interactorInputPath = inputPath;
      options.interactorInputFileName = 'input.txt';
    }

    return await ChikoJudgeSandbox.runInteractive(options);
  }

  /**
   * 完整交互题评测流程
   * @param {string} userSourceCode - 用户程序源代码
   * @param {InteractiveTestCase[]} testCases - 测试用例数组（每个用例包含交互器代码）
   * @param {string} submissionId - 提交 ID
   */
  async judge(userSourceCode, testCases, submissionId) {
    console.log('=== 开始交互题评测 ===');
    console.log(`提交 ID: ${submissionId}`);
    console.log(`测试点数量: ${testCases.length}`);

    // 1. 编译用户代码
    console.log('\n[1] 编译用户代码...');
    const userCompileResult = await this.compile(userSourceCode, `${submissionId}_user`);

    if (!userCompileResult.success) {
      console.log('用户代码编译失败');
      return {
        results: [new InteractiveJudgeResult({
          status: 'compile-error',
          compileInfo: userCompileResult.compileInfo
        })],
        totalScore: 0,
        status: 'compile-error'
      };
    }
    console.log('用户代码编译成功');

    const results = [];
    let totalScore = 0;
    let maxScore = 0;
    const interactorTempDirs = [];

    try {
      // 2. 编译并运行每个测试点
      console.log('\n[2] 开始测试点评测...');

      for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        const testNum = i + 1;
        maxScore += testCase.score;

        console.log(`\n--- 测试点 ${testNum} ---`);

        // 编译交互器
        const interactorCompile = await ChikoJudgeSandbox.compile({
          sourceCode: testCase.interactorSource,
          language: this.interactorLanguage,
          submissionId: `${submissionId}_interactor_${i}`,
          isChecker: true
        });

        if (!interactorCompile.success) {
          console.log('交互器编译失败');
          results.push(new InteractiveJudgeResult({
            status: 'system-error',
            error: 'Interactor compile failed: ' + interactorCompile.compileInfo
          }));
          continue;
        }

        interactorTempDirs.push(interactorCompile.tempDir);

        // 运行交互
        const runResult = await this.runInteractive(
          userCompileResult.executablePath,
          interactorCompile.executablePath,
          testCase,
          interactorCompile.tempDir
        );

        const { verdict, userResult, interactorResult } = runResult;

        console.log(`用户程序时间: ${userResult.result.time}ms`);
        console.log(`用户程序内存: ${Math.round(userResult.result.memory / 1024)}MB`);
        console.log(`状态: ${verdict.verdict}`);

        let status = 'unknown';
        let score = 0;

        switch (verdict.verdict) {
          case 'accepted':
            status = 'accepted';
            score = testCase.score;
            break;
          case 'partial':
            status = 'partial-accepted';
            score = Math.round(testCase.score * (verdict.normalizedScore || 0));
            break;
          case 'wrong-answer':
            status = 'wrong-answer';
            break;
          case 'user-error':
          case 'invalid-interaction':
            status = 'runtime-error';
            break;
          case 'interactor-error':
          case 'judgement-failed':
            status = 'system-error';
            break;
        }

        totalScore += score;

        if (verdict.message) {
          console.log(`消息: ${verdict.message.trim()}`);
        }
        if (verdict.reason) {
          console.log(`原因: ${verdict.reason}`);
        }

        results.push(new InteractiveJudgeResult({
          status,
          score,
          time: userResult.result.time,
          memory: userResult.result.memory,
          message: verdict.message || '',
          error: verdict.reason || ''
        }));
      }

    } finally {
      // 3. 清理临时文件
      console.log('\n[3] 清理临时文件...');
      ChikoJudgeSandbox.cleanupTempDir(userCompileResult.tempDir);
      for (const tempDir of interactorTempDirs) {
        ChikoJudgeSandbox.cleanupTempDir(tempDir);
      }
    }

    // 4. 汇总结果
    const finalStatus = totalScore >= maxScore ? 'accepted' :
                        totalScore > 0 ? 'partial-accepted' : 'wrong-answer';

    console.log('\n=== 评测结果汇总 ===');
    console.log(`总得分: ${totalScore}/${maxScore}`);
    console.log(`最终状态: ${finalStatus}`);

    return {
      results,
      totalScore,
      maxScore,
      status: finalStatus
    };
  }
}

export default Judge;
