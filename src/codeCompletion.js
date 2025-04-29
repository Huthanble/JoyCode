const vscode = require('vscode');
const { OpenAI } = require('openai');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

// 配置 DeepSeek API
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/beta',
  apiKey: 'sk-601be33605994e94a9598bc0794c1900'
});

// 用于显示加载提示的装饰器
let loadingDecorationType = null;
// 标记是否由命令手动触发
let isManuallyTriggered = false;

/**
 * 显示加载提示
 * @param {vscode.TextEditor} editor - 当前编辑器
 */
function showLoadingIndicator(editor) {
  if (!editor) return;
  
  // 清除之前的加载提示
  hideLoadingIndicator();
  
  // 创建新的装饰类型
  loadingDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: '代码生成中...',
      color: '#888888',
      fontStyle: 'italic'
    }
  });
  
  // 在光标位置显示加载提示
  const position = editor.selection.active;
  const range = new vscode.Range(position, position);
  editor.setDecorations(loadingDecorationType, [range]);
}

/**
 * 隐藏加载提示
 */
function hideLoadingIndicator() {
  if (loadingDecorationType) {
    // 获取所有编辑器
    vscode.window.visibleTextEditors.forEach(editor => {
      editor.setDecorations(loadingDecorationType, []);
    });
    loadingDecorationType.dispose();
    loadingDecorationType = null;
  }
}

/**
 * 使用大模型生成补全建议
 * @param {vscode.TextDocument} document - 当前文档
 * @param {vscode.Position} position - 光标位置
 * @returns {Promise<string|null>} - 返回补全建议或 null
 */
async function getSuggestion(document, position) {
  const fullText = document.getText();
  const cursorOffset = document.offsetAt(position);
  const prompt = fullText.slice(0, cursorOffset);
  const suffix = fullText.slice(cursorOffset);
  
  // 获取用户自定义提示词
  const customPrompt = getCustomPrompt(document);

  // 获取关联文件内容
  const relatedFiles = await getRelatedFilesContent(document);

   // 获取当前文件的Git blame信息
  const blameHistory = await getFileBlameHistory(document);

  // 读取 README
  const readme = getReadmeContent();

  // 如果文件大小超出限制，显示提示
  if (relatedFiles.truncated) {
    vscode.window.showWarningMessage(
      "相关文件长度过长，相关文件内容会被截取，请考虑是否要关闭相关文件功能", 
      "关闭相关文件功能", 
      "继续"
    ).then(selection => {
      if (selection === "关闭相关文件功能") {
        vscode.workspace.getConfiguration('joycode').update('enableRelatedFiles', false, true);
        vscode.window.showInformationMessage("已关闭相关文件功能");
      }
    });
  }

  try {
    // 构建包含自定义提示词的上下文
    let promptWithContext = '';

    promptWithContext += 
        `/*这一部分是用户设定的提示词，之后生成的代码请按照以下提示词的内容来生成:*/\n${customPrompt}\n\n`;

    // 如果有 README
    if (readme.content) {
      promptWithContext += "/*这一部分是用户github仓库中的README*/\n";
      promptWithContext += "```\n" + readme.content + "\n```\n";
      if (readme.truncated) {
        promptWithContext += "注意：README 内容因长度限制被截断。\n";
      }
      promptWithContext += "\n";
    }

    // 添加Git blame信息（正确性尚未测试）
    if (blameHistory.blameLines && blameHistory.blameLines.length > 0) {
      promptWithContext += "/*这一部分内容是当前文件在用户的github仓库中的变更历史:*/\n";
      promptWithContext += `文件: ${path.basename(document.fileName)}\n`;
      
      for (const line of blameHistory.blameLines) {
        promptWithContext += `${line}\n`;
      }
      
      if (blameHistory.truncated) {
        promptWithContext += `注意: ${blameHistory.message}\n`;
      }
      
      promptWithContext += "\n";
    }

    // 添加关联文件内容（这部分的代码正确性没有测试，如果有问题直接注释掉）
    if (relatedFiles.files.length > 0) {
      promptWithContext += "/*这一部分是与当前代码有关的相关文件（用户在同一个项目下的其他相关文件）：*/\n";
      
      for (const file of relatedFiles.files) {
        const fileName = path.basename(file.path);
        promptWithContext += `文件: ${fileName}\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
      }
      
      if (relatedFiles.truncated) {
        promptWithContext += `注意: ${relatedFiles.message}\n\n`;
      }
    }

    promptWithContext +=
        `/*代码上下文*/\n` +
        `文件: ${document.fileName}\n` +
        `语言: ${document.languageId}\n` +
        `前缀代码:\n${prompt}\n\n`;
    
    console.log("生成的前文（提示词+关联文件+github仓库提交记录+当前代码）：\n",promptWithContext);

    const response = await openai.completions.create({
      model: 'deepseek-chat',
      prompt: promptWithContext,
      suffix: suffix,
      max_tokens: 200,
      temperature: 0.5,
      stop: ['\n\n']
    });
    return response.choices[0].text.trim();
  } catch (error) {
    console.error('调用 DeepSeek API 出错:', error);
    return null;
  }
}

// 获取用户自定义提示词，应用模板变量
function getCustomPrompt(document) {
  const promptTemplate = vscode.workspace.getConfiguration('joycode').get('customPrompt', "无");
  
  if (!promptTemplate) return "无";
  
  return promptTemplate;
}

/**
 * 获取仓库根目录（存在 .git 的目录）
 */
function findGitRoot(startPath) {
  let dir = startPath;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * 检查是否启用 README 功能
 */
function isReadmeEnabled() {
  return vscode.workspace.getConfiguration('joycode').get('enableReadme', true);
}

/**
 * 读取根目录 README
 * @returns {{ content: string, truncated: boolean }}
 */
function getReadmeContent() {
  if (!isReadmeEnabled()) return { content: '', truncated: false };

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return { content: '', truncated: false };

  const root = findGitRoot(workspaceFolders[0].uri.fsPath);
  if (!root) return { content: '', truncated: false };

  const candidates = ['README.md', 'README.markdown', 'README.txt', 'README'];
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      let data = fs.readFileSync(p, 'utf8');
      const maxSize = vscode.workspace.getConfiguration('joycode').get('maxReadmeSize', 20000);
      let truncated = false;
      if (data.length > maxSize) {
        data = data.slice(0, maxSize) + '\n\n...（已截断）';
        truncated = true;
      }
      return { content: data, truncated };
    }
  }

  return { content: '', truncated: false };
}

/**
 * 检查是否启用Git blame功能
 */
function isGitBlameEnabled() {
  return vscode.workspace.getConfiguration('joycode').get('enableGitBlame', false);
}

/**
 * 检查当前文件是否在Git仓库中
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否在Git仓库中
 */
function isFileInGitRepository(filePath) {
  try {
    if (!filePath) return false;
    
    const dirPath = path.dirname(filePath);
    let currentDir = dirPath;
    
    // 向上查找.git目录，检查是否在Git仓库中
    while (currentDir && currentDir !== path.dirname(currentDir)) {
      const gitDir = path.join(currentDir, '.git');
      if (fs.existsSync(gitDir)) {
        return true;
      }
      currentDir = path.dirname(currentDir);
    }
    
    return false;
  } catch (error) {
    console.error('检查文件是否在Git仓库中失败:', error);
    return false;
  }
}

/**
 * 获取当前文件的Git blame信息
 * @param {vscode.TextDocument} document - 当前文档
 * @returns {Promise<Object>} 包含blame信息的对象
 */
async function getFileBlameHistory(document) {
  if (!isGitBlameEnabled() || !document) {
    return { blameLines: [] };
  }
  
  const filePath = document.fileName;
  
  if (!filePath || !isFileInGitRepository(filePath)) {
    return { blameLines: [] };
  }
  
  const maxBlameLines = vscode.workspace.getConfiguration('joycode').get('maxBlameLines', 50);
  const maxBlameSize = vscode.workspace.getConfiguration('joycode').get('maxBlameHistorySize', 2000);
  
  try {
    const dirPath = path.dirname(filePath);
    const relativePath = path.relative(dirPath, filePath);
    
    // 使用git blame获取文件变更历史
    // 格式: [hash] ([author] [date] [line]) [content]
    const command = `git -C "${dirPath}" blame -n -w --date=short "${relativePath}"`;
    const output = execSync(command).toString();
    
    // 解析blame输出
    const blameLines = [];
    let totalSize = 0;
    let truncated = false;
    
    const lines = output.split('\n');
    
    // 只保留指定数量的行
    const limitedLines = lines.length > maxBlameLines 
      ? lines.slice(0, maxBlameLines) 
      : lines;
    
    for (const line of limitedLines) {
      if (line.trim() === '') continue;

      console.log("提取到的文件更改历史：",line);
      console.log("\n");
      
      // 如果这行太长，截断它
      if (line.length > maxBlameSize && blameLines.length === 0) {
        blameLines.push(line.substring(0, maxBlameSize) + '... (truncated)');
        truncated = true;
        break;
      }
      
      // 检查总大小限制
      if (totalSize + line.length > maxBlameSize) {
        truncated = true;
        break;
      }
      
      blameLines.push(line);
      totalSize += line.length;
    }
    
    return {
      blameLines,
      truncated,
      message: truncated ? "变更历史因超出长度限制而被截断" : ""
    };
  } catch (error) {
    console.error('获取Git blame信息失败:', error);
    return { 
      blameLines: [],
      error: `获取Git blame信息失败: ${error.message}`
    };
  }
}

/**
 * 获取自动触发开关状态
 * @returns {boolean} - 是否启用自动触发
 */
function isAutoTriggerEnabled() {
  return vscode.workspace.getConfiguration('joycode').get('enableAutoTrigger', true);
}

/**
 * 检查是否启用关联文件功能
 */
function isRelatedFilesEnabled() {
  return vscode.workspace.getConfiguration('joycode').get('enableRelatedFiles', false);
}

/**
 * 提取文件中的导入语句并解析出文件路径
 * @param {string} content - 文件内容
 * @param {string} language - 语言类型
 * @param {string} currentFilePath - 当前文件路径
 * @returns {string[]} - 关联文件路径数组
 */
function extractImportPaths(content, language, currentFilePath) {
  const importPaths = [];
  const currentDir = path.dirname(currentFilePath);
  
  // 不同语言的导入语句正则
  const patterns = {
    javascript: [
      /import\s+.*\s+from\s+['"](\.\/|\.\.\/|\/)[^'"]+['"]/g,  // ES6 import
      /require\(\s*['"](\.\/|\.\.\/|\/)[^'"]+['"]\s*\)/g        // CommonJS require
    ],
    typescript: [
      /import\s+.*\s+from\s+['"](\.\/|\.\.\/|\/)[^'"]+['"]/g,
      /import\s*\(\s*['"](\.\/|\.\.\/|\/)[^'"]+['"]\s*\)/g
    ],
    python: [
      /from\s+(\.+\w+|\w+)(\.\w+)*\s+import/g,
      /import\s+(\w+)(\.\w+)*/g
    ],
    java: [
      /import\s+([a-zA-Z0-9_$.]+\*?);/g
    ],
    'c': [
      /#include\s+["<](\.\/|\.\.\/)?([^">]+)[">]/g
    ],
    'cpp': [
      /#include\s+["<](\.\/|\.\.\/)?([^">]+)[">]/g
    ]
  };
  
  // 获取适用于当前语言的模式
  const languagePatterns = patterns[language] || [];
  
  // 遍历所有模式进行匹配
  for (const pattern of languagePatterns) {
    const matches = content.match(pattern) || [];
    
    for (const match of matches) {
      let importPath = '';
      
      // 根据不同语言提取导入路径
      if (language === 'javascript' || language === 'typescript') {
        // 提取 'from "path"' 或 'require("path")' 中的路径
        const pathMatch = match.match(/['"]([^'"]+)['"]/);
        if (pathMatch && pathMatch[1].startsWith('.')) {
          importPath = path.resolve(currentDir, pathMatch[1]);
        }
      } else if (language === 'python') {
        // 处理 from ... import ... 或 import ...
        let modulePath = '';
        if (match.startsWith('from')) {
          const fromMatch = match.match(/from\s+([^\s]+)/);
          if (fromMatch) modulePath = fromMatch[1];
        } else {
          const importMatch = match.match(/import\s+([^\s]+)/);
          if (importMatch) modulePath = importMatch[1];
        }
        
        // 处理相对导入
        if (modulePath.startsWith('.')) {
          importPath = path.resolve(currentDir, modulePath.replace(/\./g, '/') + '.py');
        }
      } else if (language === 'java') {
        // Java 导入处理
        const packageMatch = match.match(/import\s+([^;]+);/);
        if (packageMatch) {
          const packagePath = packageMatch[1].replace(/\./g, '/');
          // 搜索项目中的Java文件
          importPath = packagePath + '.java';
        }
      } else if (language === 'c' || language === 'cpp') {
        // 处理 #include "file.h" 或 #include <file.h>
        const includeMatch = match.match(/["<]([^">]+)[">]/);
        if (includeMatch) {
          const includePath = includeMatch[1];
          if (includePath.startsWith('./') || includePath.startsWith('../')) {
            importPath = path.resolve(currentDir, includePath);
          } else {
            // 本地头文件，尝试在当前目录和项目中查找
            importPath = includePath;
          }
        }
      }
      
      if (importPath && !importPaths.includes(importPath)) {
        importPaths.push(importPath);
      }
    }
  }
  
  return importPaths;
}

/**
 * 在项目中查找文件
 * @param {string} filePath - 文件路径或模式
 * @returns {Promise<string[]>} - 找到的文件路径
 */
async function findFilesInProject(filePath) {
  // 如果是绝对路径，直接检查文件是否存在
  if (path.isAbsolute(filePath)) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return [filePath];
    } catch (error) {
      console.log("\n文件不存在：",filePath);
      // 文件不存在
      return [];
    }
  }
  
  // 对于相对路径或模块名，使用glob模式搜索
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];
  
  // 构建搜索模式
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath) || '.*';
  const searchPattern = fileName === filePath 
    ? `**/${fileName}${fileExt === '.*' ? fileExt : ''}`
    : `**/${filePath}`;
  
  try {
    const files = await vscode.workspace.findFiles(searchPattern, '**/node_modules/**');
    return files.map(file => file.fsPath);
  } catch (error) {
    console.error('搜索项目文件失败:', error);
    return [];
  }
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} - 文件内容
 */
async function readFileContent(filePath) {
  try {
    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return Buffer.from(content).toString('utf8');
  } catch (error) {
    console.error(`读取文件失败 ${filePath}:`, error);
    return '';
  }
}

/**
 * 获取关联文件的内容
 * @param {vscode.TextDocument} document - 当前文档
 * @returns {Promise<Object>} - 包含关联文件内容的对象
 */
async function getRelatedFilesContent(document) {
  if (!isRelatedFilesEnabled()) return { files: [] };
  
  const maxFileSize = vscode.workspace.getConfiguration('joycode').get('maxRelatedFileSize', 50000);
  const maxTotalSize = vscode.workspace.getConfiguration('joycode').get('maxTotalRelatedFilesSize', 50000);
  
  const content = document.getText();
  const language = document.languageId;
  const filePath = document.fileName;
  
  // 提取导入路径
  const importPaths = extractImportPaths(content, language, filePath);
  
  // 查找文件
  const relatedFiles = [];
  let totalSize = 0;
  const processedPaths = new Set(); // 防止循环引用
  
  for (const importPath of importPaths) {

    console.log("\n找到的文件路径：",importPath);

    if (processedPaths.has(importPath)) continue;
    processedPaths.add(importPath);
    
    const files = await findFilesInProject(importPath);
    
    for (const file of files) {
      if (file === filePath) continue; // 跳过自引用
      
      let fileContent = await readFileContent(file);
      
      // 检查文件大小
      if (fileContent.length > maxFileSize) {
        fileContent = fileContent.substring(0, maxFileSize) + 
          `\n// ... 文件过大，已截断 (文件长度：${fileContent.length} > 文件可读取最大长度：${maxFileSize} 字符)`;
      }
      
      // 检查总大小限制
      if (totalSize + fileContent.length > maxTotalSize) {
        if (relatedFiles.length === 0) {
          // 至少包含一个文件
          relatedFiles.push({
            path: file,
            content: fileContent.substring(0, maxTotalSize) + 
              `\n// ... 超出总大小限制 (${maxTotalSize} 字符)`
          });
        }
        return { 
          files: relatedFiles,
          truncated: true,
          message: `相关文件总大小超过限制 (${maxTotalSize} 字符)，因此只截取部分内容`
        };
      }
      
      relatedFiles.push({
        path: file,
        content: fileContent
      });
      
      totalSize += fileContent.length;
    }
  }
  
  return { files: relatedFiles };
}

/**
 * 插件激活函数
 */
function activateCodeCompletion(context) {
  const languages = ['javascript', 'python', 'java', 'c', 'cpp'];

  // 注册配置变更事件
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('joycode.enableAutoTrigger')) {
        // 配置已更改，可以在这里添加额外的处理逻辑
        console.log('自动触发设置已更改为:', isAutoTriggerEnabled());
      }
    })
  );

  // 注册快捷键命令来触发建议生成 (Alt+Ctrl+.)
  context.subscriptions.push(
    vscode.commands.registerCommand('joycode.generateSuggestion', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !languages.includes(editor.document.languageId)) return;
      
      // 显示加载提示
      showLoadingIndicator(editor);
      
      try {
        // 标记为手动触发
        isManuallyTriggered = true;
        
        // 触发内联补全
        await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
      } finally {
        // 重置标记
        setTimeout(() => {
          isManuallyTriggered = false;
        }, 500);
        
        // 无论成功与否，都隐藏加载提示
        hideLoadingIndicator();
      }
    })
  );

  // 注册内联补全提供程序
  //vscode提供的这个方法好像内嵌一个防抖的机制，只有在用户输入完成一段时间后才会生成内联代码
  //不过不清楚具体的延迟是多少
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      languages.map(lang => ({ language: lang })), // 仅支持指定的语言
      {
        provideInlineCompletionItems: async (document, position, context, token) => {
          // 检查是否应该提供补全
          const autoTriggerEnabled = isAutoTriggerEnabled();
          
          // 如果自动触发被禁用且不是手动触发，则不提供补全
          if (!autoTriggerEnabled && !isManuallyTriggered) {
            return null;
          }
          
          if(isManuallyTriggered){
            // 显示加载提示
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === document) {
              showLoadingIndicator(editor);
            }
          }
          
          try {
            // 获取建议
            const suggestion = await getSuggestion(document, position);
            if (!suggestion) return null;
            
            // 创建内联补全项
            const item = new vscode.InlineCompletionItem(suggestion);
            item.range = new vscode.Range(position, position);
            
            return [item];
          } finally {
            // 隐藏加载提示
            hideLoadingIndicator();
          }
        }
      }
    )
  );
  
  // 注册命令来切换自动触发功能
  context.subscriptions.push(
    vscode.commands.registerCommand('joycode.toggleAutoTrigger', async () => {
      const currentValue = isAutoTriggerEnabled();
      await vscode.workspace.getConfiguration('joycode').update('enableAutoTrigger', !currentValue, true);
      vscode.window.showInformationMessage(`代码自动补全已${!currentValue ? '启用' : '禁用'}`);
    })
  );

  // 注册命令来切换读取README功能
  context.subscriptions.push(
    vscode.commands.registerCommand('joycode.toggleReadme', async () => {
      const currentValue = isReadmeEnabled();
      await vscode.workspace.getConfiguration('joycode').update('enableReadme', !currentValue, true);
      vscode.window.showInformationMessage(`README读取功能${!currentValue ? '启用' : '禁用'}`);
    })
  );
  
  // 监听编辑器关闭事件，确保清理装饰器
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      hideLoadingIndicator();
    })
  );

  // 注册Git blame功能的开关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('joycode.toggleGitBlame', async () => {
      const currentValue = isGitBlameEnabled();
      await vscode.workspace.getConfiguration('joycode').update('enableGitBlame', !currentValue, true);
      vscode.window.showInformationMessage(`Git变更历史功能已${!currentValue ? '启用' : '禁用'}`);
    })
  );
  // 注册关联文件功能的开关命令
  context.subscriptions.push(
    vscode.commands.registerCommand('joycode.toggleRelatedFiles', async () => {
      const currentValue = isRelatedFilesEnabled();
      await vscode.workspace.getConfiguration('joycode').update('enableRelatedFiles', !currentValue, true);
      vscode.window.showInformationMessage(`关联文件功能已${!currentValue ? '启用' : '禁用'}`);
    })
  );

  // 注册编辑提示词命令
  context.subscriptions.push(
    vscode.commands.registerCommand('joycode.editCustomPrompt', async () => {
      const config = vscode.workspace.getConfiguration('joycode');
      const currentPrompt = config.get('customPrompt', '');
      
      const newPrompt = await vscode.window.showInputBox({
        value: currentPrompt,
        prompt: '编辑代码补全提示词',
        placeHolder: '例如：请提供高质量的{{language}}代码补全，保持代码风格一致',
        validateInput: text => {
          if (text.length > 500) {
            return '提示词过长，请保持在500字符以内';
          }
          return null;
        }
      });
      
      if (newPrompt !== undefined) { // 用户没有取消
        await config.update('customPrompt', newPrompt, true);
        console.log("用户自定义提示词：",newPrompt);
        vscode.window.showInformationMessage('代码补全提示词已更新');
      }
    })
  );
}

/**
 * 插件关闭清理
 */
function deactivateCodeCompletion() {
  hideLoadingIndicator();
}

module.exports = {
  activateCodeCompletion,
  deactivateCodeCompletion
};
