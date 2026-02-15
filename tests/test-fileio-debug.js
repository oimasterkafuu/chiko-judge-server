/**
 * 测试文件IO模式
 */

import { ChikoJudgeSandbox } from 'chiko-judge-sandbox';
import fs from 'fs';
import path from 'path';

async function test() {
  console.log('=== 测试文件IO模式 ===\n');
  
  // 创建测试程序
  const sourceCode = `#include <iostream>
#include <fstream>
using namespace std;

int main() {
    ifstream fin("data.in");
    if (!fin.is_open()) {
        cerr << "Failed to open data.in" << endl;
        return 1;
    }
    
    int a, b;
    fin >> a >> b;
    fin.close();
    
    ofstream fout("data.out");
    if (!fout.is_open()) {
        cerr << "Failed to open data.out" << endl;
        return 2;
    }
    
    fout << a + b << endl;
    fout.close();
    
    cerr << "Successfully wrote output" << endl;
    return 0;
}`;

  // 编译程序
  console.log('1. 编译程序...');
  const compileResult = await ChikoJudgeSandbox.compile({
    sourceCode,
    language: 'cpp',
    submissionId: `test_fileio_${Date.now()}`
  });
  
  if (!compileResult.success) {
    console.error('编译失败:', compileResult.compileInfo);
    return;
  }
  console.log('编译成功');
  console.log('可执行文件:', compileResult.executablePath);
  console.log('临时目录:', compileResult.tempDir);
  
  // 准备输入文件
  const inputPath = path.join(compileResult.tempDir, 'test_input.txt');
  fs.writeFileSync(inputPath, '123 456');
  console.log('\n输入文件:', inputPath);
  
  // 测试标准IO模式
  console.log('\n2. 测试标准IO模式...');
  const standardResult = await ChikoJudgeSandbox.runProgram({
    executablePath: compileResult.executablePath,
    inputPath,
    language: 'cpp',
    timeLimit: 1000,
    memoryLimit: 128 * 1024,
    isFileInput: false
  });
  
  console.log('标准IO结果:');
  console.log('  status:', standardResult.result.status);
  console.log('  code:', standardResult.result.code);
  console.log('  output:', standardResult.output);
  console.log('  error:', standardResult.error);
  
  // 测试文件IO模式
  console.log('\n3. 测试文件IO模式...');
  const fileIOResult = await ChikoJudgeSandbox.runProgram({
    executablePath: compileResult.executablePath,
    inputPath,
    language: 'cpp',
    timeLimit: 1000,
    memoryLimit: 128 * 1024,
    isFileInput: true,
    inputFileName: 'data.in',
    outputFileName: 'data.out'
  });
  
  console.log('文件IO结果:');
  console.log('  status:', fileIOResult.result.status);
  console.log('  code:', fileIOResult.result.code);
  console.log('  output:', fileIOResult.output);
  console.log('  error:', fileIOResult.error);
  
  // 清理
  ChikoJudgeSandbox.cleanupTempDir(compileResult.tempDir);
  
  console.log('\n=== 测试完成 ===');
}

test().catch(console.error);
