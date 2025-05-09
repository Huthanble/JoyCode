:

#include <iostream>

// 函数声明
int add(int a, int b);

int main() {
    int num1, num2;
    
    // 输入两个整数
    std::cout << "请输入第一个整数: ";
    std::cin >> num1;
    std::cout << "请输入第二个整数: ";
    std::cin >> num2;
    
    // 调用add函数并输出结果
    int sum = add(num1, num2);
    std::cout << "两数之和为: " << sum << std::endl;
    
    return 0;
}

// 函数定义：实现两数相加
int add(int a, int b) {
    return a + b;
}