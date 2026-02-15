/**
 * 猜数字游戏 - 用户程序
 * 使用二分查找猜出 1-100 之间的数字
 * 
 * 交互协议：
 * 1. 用户程序输出一个猜测数字
 * 2. 交互器返回 "smaller"（目标更小）、"larger"（目标更大）或 "correct"（正确）
 * 3. 用户程序根据反馈调整猜测范围
 */

#include <iostream>
#include <string>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    
    int lo = 1, hi = 100;
    
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        
        // 输出猜测
        cout << mid << endl;
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
            break;
        }
    }
    
    return 0;
}
