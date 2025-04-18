:

#include <iostream>

// Function to add two numbers
int add(int a, int b) {
    return a + b;
}

int main() {
    int num1, num2;
    
    // Prompt user to enter two numbers
    std::cout << "Enter first number: ";
    std::cin >> num1;
    
    std::cout << "Enter second number: ";
    std::cin >> num2;
    
    // Call the add function and display the result
    int sum = add(num1, num2);
    std::cout << "The sum is: " << sum << std::endl;
    
    return 0;
}