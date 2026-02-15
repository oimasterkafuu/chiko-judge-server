/**
 * A+B 问题测试脚本
 * 测试评测机的完整流程：编译 -> 运行 -> SPJ
 */

import { Judge, TestCase } from './judge.js';

// 正确的 A+B 代码
const correctCode = `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`;

// 错误的 A+B 代码（乘法）
const wrongCode = `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a * b << endl;
    return 0;
}`;

// 编译错误的代码
const compileErrorCode = `#include <iostream>
using namespace std;

int main() {
    int a, b  // 缺少分号
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`;

// 超时代码
const timeoutCode = `#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    
    // 故意造成超时
    for(int i = 0; i < 100000000; i++) {
        a += 1;
        a -= 1;
    }
    
    cout << a + b << endl;
    return 0;
}`;

// 测试用例
const testCases = [
  new TestCase({ input: '1 2', output: '3', score: 20 }),
  new TestCase({ input: '0 0', output: '0', score: 20 }),
  new TestCase({ input: '-1 1', output: '0', score: 20 }),
  new TestCase({ input: '100 200', output: '300', score: 20 }),
  new TestCase({ input: '999999 1', output: '1000000', score: 20 })
];

// 超时测试用例
const timeoutTestCases = [
  new TestCase({ input: '1 2', output: '3', timeLimit: 100, score: 100 })
];

async function testCorrectSolution() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: 正确的 A+B 解答');
  console.log('='.repeat(60) + '\n');

  const judge = new Judge({ checkerName: 'ncmp' });
  const result = await judge.judge(correctCode, testCases, 'test_correct');

  console.log('\n--- 结果 ---');
  result.results.forEach((r, i) => {
    console.log(`测试点 ${i + 1}: ${r.status} (${r.time}ms, ${Math.round(r.memory / 1024)}MB)`);
  });
  console.log(`总分: ${result.totalScore}/${result.maxScore}`);

  return result;
}

async function testWrongSolution() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 错误的 A+B 解答（乘法）');
  console.log('='.repeat(60) + '\n');

  const judge = new Judge({ checkerName: 'ncmp' });
  const result = await judge.judge(wrongCode, testCases.slice(0, 3), 'test_wrong');

  console.log('\n--- 结果 ---');
  result.results.forEach((r, i) => {
    console.log(`测试点 ${i + 1}: ${r.status} (${r.time}ms, score=${r.score})`);
  });
  console.log(`总分: ${result.totalScore}/${result.maxScore}`);

  return result;
}

async function testCompileError() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: 编译错误');
  console.log('='.repeat(60) + '\n');

  const judge = new Judge({ checkerName: 'ncmp' });
  const result = await judge.judge(compileErrorCode, testCases.slice(0, 1), 'test_compile_error');

  console.log('\n--- 结果 ---');
  console.log(`状态: ${result.status}`);
  if (result.results[0]?.compileInfo) {
    console.log('编译信息:');
    console.log(result.results[0].compileInfo);
  }

  return result;
}

async function testTimeout() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 4: 超时');
  console.log('='.repeat(60) + '\n');

  const judge = new Judge({ checkerName: 'ncmp' });
  const result = await judge.judge(timeoutCode, timeoutTestCases, 'test_timeout');

  console.log('\n--- 结果 ---');
  result.results.forEach((r, i) => {
    console.log(`测试点 ${i + 1}: ${r.status}`);
  });

  return result;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           评测机原型 - A+B 问题完整测试                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    await testCorrectSolution();
    await testWrongSolution();
    await testCompileError();
    await testTimeout();

    console.log('\n' + '='.repeat(60));
    console.log('所有测试完成');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
