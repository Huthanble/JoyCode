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
  return code.replace(/```[a-zA-Z]*\n?|```/g, '').trim();
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

function runCode(lang, code) {
  return new Promise((resolve) => {
    const cleanedCode = stripMarkdown(code);
    const filePath = getTempFilePath(lang);
    fs.writeFileSync(filePath, cleanedCode);

    let command = '';
    switch (lang) {
      case 'python':
        command = `python3 ${filePath}`;
        break;
      case 'javascript':
        command = `node ${filePath}`;
        break;
      case 'cpp':
        command = `g++ ${filePath} -o ${filePath}.out && ${filePath}.out`;
        break;
      case 'java':
        command = `javac ${filePath} && java -cp ${path.dirname(filePath)} ${path.basename(filePath).replace('.java', '')}`;
        break;
      default:
        return resolve({ success: false, message: '不支持的语言类型。' });
    }

    exec(command, (error, stdout, stderr) => {
      if (error || stderr) {
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
