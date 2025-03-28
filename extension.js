const vscode = require('vscode');
const { OpenAI } = require('openai');

// 配置 DeepSeek API
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
  const fullText = document.getText();
  const cursorOffset = document.offsetAt(position);
  const prompt = fullText.slice(0, cursorOffset);
  const suffix = fullText.slice(cursorOffset);

  try {
    const response = await openai.completions.create({
      model: 'deepseek-chat',
      prompt: prompt,
      suffix: suffix,
      max_tokens: 100,
      temperature: 0.5,
      stop: ['\n\n']
    });
    return response.choices[0].text.trim();
  } catch (error) {
    console.error('调用 DeepSeek API 出错:', error);
    return null;
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
  clearGhostText(editor);

  // 生成新的补全建议
  currentSuggestion = await getSuggestion(document, position);
  if (!currentSuggestion) return;

  // 创建新的装饰类型，支持多行
  decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: currentSuggestion,
      color: '#99999999',
      fontStyle: 'italic'
    }
  });

  // 在光标位置显示虚影
  const range = new vscode.Range(position, position);
  editor.setDecorations(decorationType, [range]);
}

/**
 * 清除虚影
 * @param {vscode.TextEditor} editor - 当前编辑器
 */
function clearGhostText(editor) {
  if (decorationType) {
    editor.setDecorations(decorationType, []);
    decorationType.dispose();
    decorationType = null;
    currentSuggestion = '';
  }
}

/**
 * 插件激活函数
 */
function activate(context) {
  const languages = ['javascript', 'python', 'java', 'c', 'cpp'];

  // 注册快捷键命令
  context.subscriptions.push(
    vscode.commands.registerCommand('joycode.generateSuggestion', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && languages.includes(editor.document.languageId)) {
        updateGhostText(editor);
      }
    })
  );

  // 处理 Tab 键
  context.subscriptions.push(
    vscode.commands.registerCommand('tab', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      if (currentSuggestion) {
        const position = editor.selection.active;
        editor.edit(editBuilder => {
          editBuilder.insert(position, currentSuggestion);
        }).then(() => {
          clearGhostText(editor);
        });
      } else {
        const editor = vscode.window.activeTextEditor;
		if (editor) {
  			editor.edit(editBuilder => {
    			editBuilder.insert(editor.selection.active, '\t');
  			});
		}
      }
    })
  );

  // 监听文本变化以清除虚影
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && languages.includes(editor.document.languageId)) {
        clearGhostText(editor);
      }
    })
  );

  // 监听光标移动以清除虚影
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(event => {
      const editor = event.textEditor;
      if (languages.includes(editor.document.languageId)) {
        clearGhostText(editor);
      }
    })
  );
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
