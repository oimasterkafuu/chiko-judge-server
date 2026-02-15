/**
 * 自定义 Checker 示例 - 数值比较器
 * 这是一个简化版的 ncmp checker
 * 
 * 用法：checker <input> <output> <answer>
 * 
 * 输出格式：
 * - 将分数（0-100）写入 stdout
 * - 将消息写入 stderr
 */

#include "testlib.h"

using namespace std;

int main(int argc, char *argv[]) {
    // 设置 checker 名称
    setName("compare numbers");
    
    // 注册 testlib 命令行处理
    registerTestlibCmd(argc, argv);
    
    int n = 0;
    
    // 逐个比较数字
    while (!ans.seekEof() && !ouf.seekEof()) {
        n++;
        long long expected = ans.readLong();
        long long actual = ouf.readLong();
        
        if (expected != actual) {
            quitf(_wa, "%d%s numbers differ - expected: '%lld', found: '%lld'", 
                  n, englishEnding(n).c_str(), expected, actual);
        }
    }
    
    // 检查答案文件是否有多余内容
    int extraInAnsCount = 0;
    while (!ans.seekEof()) {
        ans.readLong();
        extraInAnsCount++;
    }
    
    // 检查输出文件是否有多余内容
    int extraInOufCount = 0;
    while (!ouf.seekEof()) {
        ouf.readLong();
        extraInOufCount++;
    }
    
    if (extraInAnsCount > 0) {
        quitf(_wa, "Answer contains longer sequence [length = %d], but output contains %d elements",
              n + extraInAnsCount, n);
    }
    
    if (extraInOufCount > 0) {
        quitf(_wa, "Output contains longer sequence [length = %d], but answer contains %d elements",
              n + extraInOufCount, n);
    }
    
    // 全部正确
    quitf(_ok, "%d numbers match", n);
}
