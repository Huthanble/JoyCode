const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

function detectLanguage(code, languageId) {
  if (languageId) return languageId; 
  if (/```(cpp|c\+\+)/i.test(code)) return 'cpp';
  if (/```python/i.test(code) || /import\s+.+|def\s+\w+/i.test(code)) return 'python';
  if (/```java/i.test(code) || /class\s+\w+/i.test(code)) return 'java';
  if (/```javascript/i.test(code) || /function\s+\w+|console\.log/i.test(code)) return 'javascript';
  return 'unknown';
}

function stripMarkdown(code) {
  return code.replace(/^[：:]+/gm, '') // 新增：去除每行开头的全角/半角冒号
             .replace(/```[a-zA-Z]*\n?|```/g, '')
             .trim();
}

function getTempFilePath(lang) {
  const base = path.join(__dirname, 'temp_code');
  switch (lang) {
    case 'python': return `${base}.py`;
    case 'javascript': return `${base}.js`;
    case 'cpp': return `${base}.cpp`;
    case 'java': return `${base}.java`;
    default: return `${base}.txt`;
  }
}
//检查补全的代码是否为函数
function wrapCppFunctionForTest(code) {
  // 检查是否有 main 函数
  if (/int\s+main\s*\(/.test(code)) return code;

  // 简单提取函数名和参数
  const match = code.match(/(\w+)\s+(\w+)\s*\(([^)]*)\)/);
  if (!match) return code; // 不是函数，直接返回

  const funcName = match[2];
  const params = match[3].split(',').map(p => p.trim().split(' ')[1] || '0').join(', ');

  // 生成 main 测试代码
  const testMain = `
    int main() {
        auto result = ${funcName}(${params});
        std::cout << "Test result: " << result << std::endl;
        return 0;
    }
  `;

  return code + '\n' + testMain;
}

function runCode(lang, code) {
  return new Promise((resolve) => {
    const cleanedCode = stripMarkdown(code);
    const recleanedCode = wrapCppFunctionForTest(cleanedCode);
    const filePath = getTempFilePath(lang);
    fs.writeFileSync(filePath, recleanedCode);

    let command = '';
    switch (lang) {
      case 'python':
        command = `python3 ${filePath}`;
        break;
      case 'javascript':
        command = `node ${filePath}`;
        break;
      case 'cpp':
        const exePath = `${filePath}.exe`;
        command = `g++ "${filePath}" -o "${exePath}" && echo 1 2 |"${exePath}"`;
        break;
      case 'java':
        command = `javac ${filePath} && java -cp ${path.dirname(filePath)} ${path.basename(filePath).replace('.java', '')}`;
        break;
      default:
        return resolve({ success: false, message: '不支持的语言类型。' });
    }

    exec(command, (error, stdout, stderr) => {
      console.log('error:', error);
      console.log('stdout:', stdout);
      console.log('stderr:', stderr);
      if (error && error.code !== 0) {
        resolve({ success: false, message: stderr || error.message });
      } else {
        resolve({ success: true, message: stdout });
      }
    });
  });
}

module.exports = {
  detectLanguage,
  runCode
};
