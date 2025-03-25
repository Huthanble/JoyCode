const vscode = require('vscode');

// 当前的虚影装饰类型和内容（样式）
let decorationType = null;
//生成的建议
let currentSuggestion = '';

/**
 * 根据语言和输入生成补全建议
 */
//document是当前打开的整个文件，position是光标的具体位置
function getSuggestion(document, position) {
  const language = document.languageId;
  const line = document.lineAt(position.line);
  //linePrefix是截取光标前的语句（可能之后可以在这里优化）
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

  const document = editor.document;//取到文件
  const position = editor.selection.active;//得到光标位置

  // 清除之前的虚影
  if (decorationType) {
    editor.setDecorations(decorationType, []);
    //dispose用来释放装饰器资源
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
  //setDecorations用来将decorationType这个装饰器的效果，应用在当前编辑器的range位置上
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
    //onDidChangeTextDocument在打字或删除字符时触发
    vscode.workspace.onDidChangeTextDocument(event => {
      //editor 是一个对象，代表在 VS Code 中当前正在使用的文本编辑器
      //就是打开的那个代码窗口，里面包含了正在编辑的文件、光标位置、选中的文字等信息
      //vscode.window.activeTextEditor始终指向当前“活跃”的编辑器，也就是正在操作的那个窗口
      const editor = vscode.window.activeTextEditor;
      if (editor && languages.includes(editor.document.languageId)) {
        updateGhostText(editor);
      }
    })
  );

  // 监听光标移动
  context.subscriptions.push(
    //onDidChangeTextEditorSelection在每次移动光标的时候触发
    vscode.window.onDidChangeTextEditorSelection(event => {
      //event.textEditor来自某个事件（比如光标移动或文本变化），指向触发这个事件的编辑器
      const editor = event.textEditor;
      if (languages.includes(editor.document.languageId)) {
        updateGhostText(editor);
      }
    })
  );

  //好像并用不到捕获普通按键的处理，但是处于保险还是留下了
  // 注册 Tab 键命令
  // 保留原有的 type 命令处理器，处理普通按键
  // context.subscriptions.push(
  //   vscode.commands.registerCommand('type', (args) => {
  //     const editor = vscode.window.activeTextEditor;
  //     if (!editor) return;

  //     // 调试输出每次按键
  //     console.log('Type command - Key pressed:', JSON.stringify(args.text));

  //     // 执行默认的 type 行为
  //     vscode.commands.executeCommand('default:type', args);
  //   }, { when: 'editorTextFocus' })
  // );

  // 新增 tab 命令处理器，捕获 Tab 键
  // （之前用普通按键匹配\t根本捕获不到，修了半天bug，才发现tab是个单独的按键）
  context.subscriptions.push(
    vscode.commands.registerCommand('tab', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      // 调试输出，确认 Tab 键被捕获
      console.log('Tab command - Tab pressed, currentSuggestion:', currentSuggestion);

      if (currentSuggestion) {
        const position = editor.selection.active;
        //edit用来修改编辑器中的文本（插入、删除、替换等）
        //接收一个回调函数，里面是要做的修改操作
        editor.edit(editBuilder => {
          //editBuilder是一个对象，用来提供删除，插入等方法
          console.log('Inserting:', currentSuggestion);
          editBuilder.insert(position, currentSuggestion); // 插入虚影内容
        }).then(() => {
          // 清除虚影
          if (decorationType) {
            editor.setDecorations(decorationType, []);
            decorationType.dispose();
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
