const vscode = require('vscode');
const { OpenAI } = require('openai'); // 需要安装 OpenAI SDK

// 配置 OpenAI API
const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/beta',
  apiKey: 'sk-601be33605994e94a9598bc0794c1900'
});

// 当前的虚影装饰类型和内容
let decorationType = null;
let currentSuggestion = '';

/**
 * 使用大模型生成补全建议
 * @param {vscode.TextDocument} document - 当前文档
 * @param {vscode.Position} position - 光标位置
 * @returns {Promise<string|null>} - 返回补全建议或 null
 */
async function getSuggestion(document, position) {
  const fileContent = document.getText();              // 整个文件内容
  const lineNumber = position.line + 1;                // 行号（从 1 开始）
  const columnNumber = position.character + 1;         // 列号（从 1 开始）
  const language = document.languageId;                // 当前文件语言（如 'javascript'）
  
  const line = document.lineAt(position.line);
  //linePrefix是截取光标前的语句（可能之后可以在这里优化）
  const linePrefix = line.text;

  // 构建提示（prompt），明确需求
  const prompt = linePrefix;

  try {
    // 调用 OpenAI API
    const response = await openai.completions.create({
      model: 'deepseek-chat',    // 使用 deepseek-chat 模型
      prompt: prompt,            // 改进后的提示
      max_tokens: 20,            // 限制生成长度
      temperature: 0.5,          // 控制随机性
      stop: ['\n', ';']          // 在换行或分号处停止
    });
    // 返回大模型生成的建议，去掉多余空格
    return response.choices[0].text.trim();
    // return response.choices[0].text;
  } catch (error) {
    console.error('调用 OpenAI API 出错:', error);
    return null; // 出错时返回 null，不显示虚影
  }
}

/**
 * 更新虚影显示
 * @param {vscode.TextEditor} editor - 当前编辑器
 */
async function updateGhostText(editor) {
  if (!editor) return;

  const document = editor.document;
  const position = editor.selection.active;

  // 清除之前的虚影
  if (decorationType) {
    editor.setDecorations(decorationType, []);
    decorationType.dispose();
  }

  // 生成新的补全建议（异步）
  currentSuggestion = await getSuggestion(document, position);
  if (!currentSuggestion) return;

  // 创建新的装饰类型（灰色虚影）
  decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: currentSuggestion, // 虚影内容
      color: '#99999999',             // 灰色，带透明度
      fontStyle: 'italic'             // 可选：斜体区分虚影
    }
  });

  // 在光标位置显示虚影
  const range = new vscode.Range(position, position);
  editor.setDecorations(decorationType, [range]);
}

/**
 * 插件激活函数
 */
function activate(context) {
  // 支持的语言
  const languages = ['javascript', 'python', 'java', 'c', 'cpp'];

  // 使用防抖优化文本变化监听
  let timeout;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        const editor = vscode.window.activeTextEditor;
        if (editor && languages.includes(editor.document.languageId)) {
          updateGhostText(editor);
        }
      }, 5000); // 5秒防抖
    })
  );

  // 监听光标移动
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      const editor = event.textEditor;
      if (languages.includes(editor.document.languageId)) {
        updateGhostText(editor);
      }
    })
  );

  // 处理普通按键
  // context.subscriptions.push(
  //   vscode.commands.registerCommand('type', (args) => {
  //     const editor = vscode.window.activeTextEditor;
  //     if (!editor) return;
  //     console.log('Type command - Key pressed:', JSON.stringify(args.text));
  //     vscode.commands.executeCommand('default:type', args);
  //   }, { when: 'editorTextFocus' })
  // );

  // 处理 Tab 键
  context.subscriptions.push(
    vscode.commands.registerCommand('tab', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      console.log('Tab command - Tab pressed, currentSuggestion:', currentSuggestion);
      if (currentSuggestion) {
        const position = editor.selection.active;
        editor.edit(editBuilder => {
          console.log('Inserting:', currentSuggestion);
          editBuilder.insert(position, currentSuggestion);
        }).then(() => {
          if (decorationType) {
            editor.setDecorations(decorationType, []);
            decorationType.dispose();
            decorationType = null;
            currentSuggestion = '';
          }
        });
      } else {
        vscode.commands.executeCommand('default:tab');
      }
    })
  );

  // 初始化虚影
  const editor = vscode.window.activeTextEditor;
  if (editor && languages.includes(editor.document.languageId)) {
    updateGhostText(editor);
  }
}

/**
 * 插件关闭清理
 */
function deactivate() {
  if (decorationType) {
    decorationType.dispose();
  }
}

module.exports = {
  activate,
  deactivate
};
