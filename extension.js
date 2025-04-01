const vscode = require('vscode');
const { OpenAI } = require('openai');

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
 * 获取自动触发开关状态
 * @returns {boolean} - 是否启用自动触发
 */
function isAutoTriggerEnabled() {
  return vscode.workspace.getConfiguration('joycode').get('enableAutoTrigger', true);
}

/**
 * 插件激活函数
 */
function activate(context) {
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
  
  // 监听编辑器关闭事件，确保清理装饰器
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      hideLoadingIndicator();
    })
  );
}

/**
 * 插件关闭清理
 */
function deactivate() {
  hideLoadingIndicator();
}

module.exports = {
  activate,
  deactivate
};
