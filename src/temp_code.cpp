#include <iostream>
using namespace std;

int add(int a, int b) {
    return a + b;
}

int main() {
    int a = 1, b = 2;
    auto result = add(a, b);
    std::cout << "Test result: " << result << std::endl;
    return 0;
}