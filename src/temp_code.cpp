#include <iostream>
#include <utility>  // 用于 std::swap

/**
 * @brief 冒泡排序函数（升序）
 * @tparam T 数组元素类型（支持可比较的基本类型，如int、double等）
 * @param arr 待排序的数组（原地排序，会修改原数组）
 * @param n 数组元素个数
 * @note 优化点：若某轮未发生交换，说明数组已有序，提前退出循环
 */
template <typename T>
void bubbleSort(T arr[], int n) {
    if (n <= 1) {  // 边界情况：空数组或单个元素无需排序
        return;
    }

    // 外层循环：控制排序轮数（最多n-1轮，因每轮至少确定1个元素位置）
    for (int i = 0; i < n - 1; ++i) {
        bool swapped = false;  // 标记本轮是否发生交换

        // 内层循环：每轮比较相邻元素，将最大元素"冒泡"到末尾
        // 每轮减少i次比较（末尾i个元素已排好序）
        for (int j = 0; j < n - 1 - i; ++j) {
            if (arr[j] > arr[j + 1]) {  // 升序：前 > 后则交换
                std::swap(arr[j], arr[j + 1]);
                swapped = true;  // 标记发生交换
            }
        }

        if (!swapped) {  // 若本轮无交换，数组已有序，提前退出
            break;
        }
    }
}

// 示例：测试不同类型数组的排序
int main() {
    // 测试整数数组
    int intArr[] = {64, 34, 25, 12, 22, 11, 90};
    int intSize = sizeof(intArr) / sizeof(intArr[0]);
    std::cout << "整数数组排序前: ";
    for (int num : intArr) std::cout << num << " ";
    std::cout << "\n";

    bubbleSort(intArr, intSize);
    std::cout << "整数数组排序后: ";
    for (int num : intArr) std::cout << num << " ";
    std::cout << "\n\n";

    // 测试浮点数数组
    double doubleArr[] = {3.14, 1.41, 2.71, 0.58, 1.62};
    int doubleSize = sizeof(doubleArr) / sizeof(doubleArr[0]);
    std::cout << "浮点数数组排序前: ";
    for (double num : doubleArr) std::cout << num << " ";
    std::cout << "\n";

    bubbleSort(doubleArr, doubleSize);
    std::cout << "浮点数数组排序后: ";
    for (double num : doubleArr) std::cout << num << " ";
    std::cout << "\n";

    return 0;
}