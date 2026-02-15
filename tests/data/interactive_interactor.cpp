/**
 * 猜数字游戏 - 交互器
 * 从 input.txt 读取目标数字，与用户程序交互
 * 
 * 交互协议：
 * 1. 读取用户程序的猜测
 * 2. 返回 "smaller"、"larger" 或 "correct"
 * 3. 最终将分数写入 score.txt，消息写入 message.txt
 */

#include <iostream>
#include <fstream>
#include <string>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    
    // 从 input.txt 读取目标数字
    int target = 42;  // 默认值
    ifstream fin("input.txt");
    if (fin.is_open()) {
        fin >> target;
        fin.close();
    }
    
    const int MAX_GUESSES = 10;
    int guessCount = 0;
    int guess;
    
    while (guessCount < MAX_GUESSES && cin >> guess) {
        guessCount++;
        
        if (guess < target) {
            cout << "smaller" << endl;
            cout.flush();
        } else if (guess > target) {
            cout << "larger" << endl;
            cout.flush();
        } else {
            // 猜对了
            cout << "correct" << endl;
            cout.flush();
            
            // 写入分数和消息
            ofstream scoreFile("score.txt");
            ofstream messageFile("message.txt");
            scoreFile << 100;
            messageFile << "Correct! Guessed in " << guessCount << " tries. Target was " << target << ".";
            
            return 0;
        }
    }
    
    // 超过最大猜测次数或读取失败
    ofstream scoreFile("score.txt");
    ofstream messageFile("message.txt");
    scoreFile << 0;
    messageFile << "Failed to guess. Target was " << target << ". Made " << guessCount << " guesses.";
    
    return 0;
}
