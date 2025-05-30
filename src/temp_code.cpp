#include <iostream>
/**
 * @brief 计算三个整数的和
 * 
 * @param a 第一个整数
 * @param b 第二个整数
 * @param c 第三个整数
 * @return int 三个整数的和
 */
int sumOfThree(int a, int b, int c) {
    return a + b + c;
}

    int main() {
      auto result = sumOfThree();
      std::cout << "Test result: " << result << std::endl;
      return 0;
    }
    