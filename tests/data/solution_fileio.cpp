/**
 * A+B Problem - 文件输入输出版本
 * 从 data.in 读取两个整数，将结果写入 data.out
 */

#include <iostream>
#include <fstream>
using namespace std;

int main() {
    ifstream fin("data.in");
    ofstream fout("data.out");
    
    int a, b;
    fin >> a >> b;
    fout << a + b << endl;
    
    fin.close();
    fout.close();
    
    return 0;
}
