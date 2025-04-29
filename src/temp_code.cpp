：
#include <iostream>

// Function to add two numbers
int addNumbers(int num1, int num2) {
    return num1 + num2;
}

int main() {
    int firstNumber, secondNumber;
    
    // Input the two numbers
    std::cout << "Enter first number: ";
    std::cin >> firstNumber;
    std::cout << "Enter second number: ";
    std::cin >> secondNumber;
    
    // Calculate and display the sum
    int sum = addNumbers(firstNumber, secondNumber);
    std::cout << "The sum of " << firstNumber << " and " << secondNumber 
              << " is: " << sum << std::endl;
    
    return 0;
}