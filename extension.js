const vscode = require('vscode');

// 当前的虚影装饰类型和内容
let decorationType = null;
let currentSuggestion = '';

/**
 * 根据语言和输入生成补全建议
 */
function getSuggestion(document, position) {
  const language = document.languageId;
  const line = document.lineAt(position.line);
  const linePrefix = line.text.substr(0, position.character);

  if (language === 'javascript') {
    if (linePrefix.endsWith('.')) return 'push()';
    if (linePrefix.match(/\bfunction\s*$/)) return ' myFunc() { }';
    return 'console.log()';
  } else if (language === 'python') {
    if (linePrefix.endsWith('.')) return 'append()';
    if (linePrefix.match(/\bdef\s*$/)) return ' my_func():';
    return 'print()';
  } else if (language === 'java') {
    if (linePrefix.endsWith('.')) return 'toString()';
    if (linePrefix.match(/\bclass\s*$/)) return ' MyClass { }';
    return 'System.out.println()';
  } else if (language === 'c' || language === 'cpp') {
    if (linePrefix.endsWith('.')) return 'member';
    if (linePrefix.match(/\bint\s*$/)) return ' main() { return 0; }';
    return 'printf()';
  }
  return 'example()'; // 默认建议
}

/**
 * 更新虚影显示
 */
function updateGhostText(editor) {
  if (!editor) return;

  const document = editor.document;
  const position = editor.selection.active;

  // 清除之前的虚影
  if (decorationType) {
    editor.setDecorations(decorationType, []);
    decorationType.dispose();
  }

  // 生成新的补全建议
  currentSuggestion = getSuggestion(document, position);
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

  // 监听文本变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && languages.includes(editor.document.languageId)) {
        updateGhostText(editor);
      }
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

  // 注册 Tab 键命令
  // 保留原有的 type 命令处理器，处理普通按键
  context.subscriptions.push(
    vscode.commands.registerCommand('type', (args) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      // 调试输出每次按键
      console.log('Type command - Key pressed:', JSON.stringify(args.text));

      // 执行默认的 type 行为
      vscode.commands.executeCommand('default:type', args);
    }, { when: 'editorTextFocus' })
  );

  // 新增 tab 命令处理器，捕获 Tab 键
  context.subscriptions.push(
    vscode.commands.registerCommand('tab', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      // 调试输出，确认 Tab 键被捕获
      console.log('Tab command - Tab pressed, currentSuggestion:', currentSuggestion);

      if (currentSuggestion) {
        const position = editor.selection.active;
        editor.edit(editBuilder => {
          console.log('Inserting:', currentSuggestion);
          editBuilder.insert(position, currentSuggestion); // 插入虚影内容
        }).then(() => {
          // 清除虚影
          if (decorationType) {
            editor.setDecorations(decorationType, []);
            decorationType.dispose();
            decorationType = null;
            currentSuggestion = '';
          }
        });
      } else {
        // 如果没有虚影，执行默认的 Tab 行为（例如缩进）
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

function deactivate() {
  if (decorationType) {
    decorationType.dispose();
  }
}

module.exports = {
  activate,
  deactivate
};
