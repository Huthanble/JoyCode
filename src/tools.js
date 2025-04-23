

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { openai } = require('./openaiClient');

function detectLanguage(code) {
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

async function retryWithFeedback(userKeywords, code, lang, maxAttempts = 2) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    const result = await runCode(lang, code);
    if (result.success) return { success: true, code, output: result.message };

    const feedbackPrompt = `你根据以下注释生成了这段代码：\n\n注释: ${userKeywords}\n\n代码：\n\n\`\`\`${lang}\n${stripMarkdown(code)}\n\`\`\`\n\n运行时报错如下：\n${result.message}\n\n请只输出修复后的完整代码（无额外解释）`;

    const response = await openai.completions.create({
      model: 'deepseek-chat',
      prompt: feedbackPrompt,
      max_tokens: 1500
    });

    const newCode = response.choices[0]?.text.trim();
    code = newCode;
    attempt++;
  }
  return { success: false, code, output: '多次优化失败，请手动检查。' };
}

module.exports = {
  detectLanguage,
  runCode,
  retryWithFeedback
};
