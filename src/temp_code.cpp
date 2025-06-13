#include <iostream>
int addThreeNumbers(int a, int b, int c) {
    int sum = a + b + c;  
    return sum;
}

int main() {
  auto result = addThreeNumbers(1, 1, 1);
  std::cout << "Test result: " << result << std::endl;
  return 0;
}
    