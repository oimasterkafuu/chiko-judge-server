/**
 * A+B Problem - 错误解法（用于测试错误处理）
 * 
 * 包含三种错误情况：
 * 1. 特判错误：100+200 时输出 400（部分测试点错误）
 * 2. 死循环：输入包含负数时进入无限循环
 * 3. 运行错误：输入 0+0 时除以零
 */

#include <iostream>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    
    // 情况1：特判错误 - 100+200 输出 400
    if (a == 100 && b == 200) {
        cout << 400 << endl;
        return 0;
    }
    
    // 情况2：死循环 - 输入包含负数
    if (a < 0 || b < 0) {
        while (true) {
            // 无限循环
        }
    }
    
    // 情况3：运行错误 - 0+0 时除以零
    if (a == 0 && b == 0) {
        int x = 1 / 0;  // 除以零
        cout << x << endl;
        return 0;
    }
    
    // 其他情况正常输出
    cout << a + b << endl;
    return 0;
}
