/**
 * 交互题测试 - 二分查找猜数字问题
 * 
 * 题目描述：
 * 系统随机想一个 1-100 的数字，你需要猜出这个数字。
 * 每次猜测后，系统会告诉你猜的数字是"大了"、"小了"还是"对了"。
 * 你最多可以猜 7 次（因为 log2(100) ≈ 6.64，所以 7 次足够）。
 */

import { InteractiveJudge } from './judge.js';

/**
 * 生成交互器代码
 * 交互器会读取输入文件中的目标数字，然后与用户程序交互
 */
function createInteractor(targetNumber) {
  return `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // 目标数字
    const int TARGET = ${targetNumber};
    const int MAX_GUESSES = 10;
    
    int guessCount = 0;
    int guess;

    while (guessCount < MAX_GUESSES) {
        if (!(cin >> guess)) {
            // 用户程序没有输出或输出格式错误
            ofstream score("score.txt");
            ofstream message("message.txt");
            score << 0;
            message << "读取猜测失败，请确保输出一个整数";
            return 0;
        }
        
        guessCount++;
        
        if (guess < TARGET) {
            cout << "smaller\\n";
            cout.flush();
        } else if (guess > TARGET) {
            cout << "larger\\n";
            cout.flush();
        } else {
            // 猜对了 - 先告诉用户程序，让它能正常退出
            cout << "correct\\n";
            cout.flush();
            
            // 等待一小段时间让用户程序退出
            this_thread::sleep_for(chrono::milliseconds(10));
            
            ofstream score("score.txt");
            ofstream message("message.txt");
            score << 100;
            message << "Correct! Guessed in " << guessCount << " tries.";
            return 0;
        }
    }
    
    // 超过最大猜测次数
    ofstream score("score.txt");
    ofstream message("message.txt");
    score << 0;
    message << "Too many guesses (" << guessCount << "). Target was " << TARGET;
    return 0;
}`;
}

// 正确的二分查找解法
const correctUserCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int lo = 1, hi = 100;
    
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        
        // 输出猜测
        cout << mid << "\\n";
        cout.flush();
        
        // 读取反馈
        string feedback;
        if (!(cin >> feedback)) {
            return 1;
        }
        
        if (feedback == "smaller") {
            lo = mid + 1;
        } else if (feedback == "larger") {
            hi = mid - 1;
        } else if (feedback == "correct") {
            // 猜对了
            break;
        }
    }
    
    return 0;
}`;

// 错误解法：线性查找
const wrongUserCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // 从 1 开始逐个猜（最多猜 10 次，可能不够）
    for (int i = 1; i <= 10; i++) {
        cout << i << "\\n";
        cout.flush();
        
        string feedback;
        if (!(cin >> feedback)) {
            return 1;
        }
        
        if (feedback == "smaller") {
            // 目标比 i 大，继续
        } else if (feedback == "larger") {
            // 目标比 i 小，但我们从 1 开始，这种情况不应该发生
            break;
        } else {
            break;
        }
    }
    
    return 0;
}`;

// 编译错误的代码
const compileErrorUserCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
    int lo = 1, hi = 100  // 缺少分号
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        cout << mid << "\\n";
        cout.flush();
        string feedback;
        cin >> feedback;
        if (feedback == "smaller") lo = mid + 1;
        else if (feedback == "larger") hi = mid - 1;
        else break;
    }
    return 0;
}`;

/**
 * 创建测试用例数组
 */
function createTestCases(numbers) {
  return numbers.map((num) => ({
    interactorSource: createInteractor(num),
    timeLimit: 1000,
    score: Math.round(100 / numbers.length)
  }));
}

// 测试用数字：包含边界值和随机值
const testNumbers = [1, 50, 100, 42, 77, 13, 88];

async function testCorrectSolution() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: 正确的二分查找解法');
  console.log('='.repeat(60) + '\n');

  const judge = new InteractiveJudge();
  const testCases = testNumbers.map(num => ({
    interactorSource: createInteractor(num),
    timeLimit: 1000,
    score: Math.round(100 / testNumbers.length)
  }));

  const result = await judge.judge(correctUserCode, testCases, 'interactive_correct');

  console.log('\n--- 结果 ---');
  result.results.forEach((r, i) => {
    console.log(`测试点 ${i + 1} (target=${testNumbers[i]}): ${r.status} (${r.time}ms, score=${r.score})`);
    if (r.message) console.log(`  消息: ${r.message}`);
  });
  console.log(`总分: ${result.totalScore}/${result.maxScore}`);

  return result;
}

async function testWrongSolution() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 错误的线性查找解法');
  console.log('='.repeat(60) + '\n');

  const judge = new InteractiveJudge();
  const testCases = testNumbers.map(num => ({
    interactorSource: createInteractor(num),
    timeLimit: 1000,
    score: Math.round(100 / testNumbers.length)
  }));

  const result = await judge.judge(wrongUserCode, testCases, 'interactive_wrong');

  console.log('\n--- 结果 ---');
  result.results.forEach((r, i) => {
    console.log(`测试点 ${i + 1} (target=${testNumbers[i]}): ${r.status} (${r.time}ms, score=${r.score})`);
    if (r.message) console.log(`  消息: ${r.message}`);
  });
  console.log(`总分: ${result.totalScore}/${result.maxScore}`);

  return result;
}

async function testCompileError() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: 编译错误');
  console.log('='.repeat(60) + '\n');

  const judge = new InteractiveJudge();
  const testCases = [{
    interactorSource: createInteractor(50),
    timeLimit: 1000,
    score: 100
  }];

  const result = await judge.judge(compileErrorUserCode, testCases, 'interactive_compile_error');

  console.log('\n--- 结果 ---');
  console.log(`状态: ${result.status}`);
  if (result.results[0]?.compileInfo) {
    console.log('编译信息:');
    console.log(result.results[0].compileInfo);
  }

  return result;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       交互题测试 - 二分查找猜数字问题                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  console.log('\n题目说明:');
  console.log('  系统想一个 1-100 的数字，你需要猜出它。');
  console.log('  每次猜测后会得到 "larger"(大了)、"smaller"(小了) 或正确的反馈。');
  console.log('  最多允许 10 次猜测。');

  try {
    await testCorrectSolution();
    await testWrongSolution();
    await testCompileError();

    console.log('\n' + '='.repeat(60));
    console.log('所有交互题测试完成');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('测试过程中发生错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
