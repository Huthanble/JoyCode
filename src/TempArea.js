const { getOpenAIInstance, getSelectedModel } = require('./openaiClient');
const vscode = require('vscode');

let tempAreaContent = '';
let tempAreaPanel = null; // 保存 WebviewPanel 实例

function addToTempArea(selectedText) {
  tempAreaContent += selectedText + '\n';
  // 如果面板已打开，则刷新内容
  if (tempAreaPanel) {
    tempAreaPanel.webview.html = getTempAreaHtml(tempAreaContent);
  }
}

function showTempAreaPanel(context) {
  if (tempAreaPanel) {
    tempAreaPanel.reveal(vscode.ViewColumn.Beside);
    tempAreaPanel.webview.html = getTempAreaHtml(tempAreaContent);
    return;
  }
  tempAreaPanel = vscode.window.createWebviewPanel(
    'tempAreaPanel',
    '临时可视化区域',
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );
  tempAreaPanel.webview.html = getTempAreaHtml(tempAreaContent);
  tempAreaPanel.onDidDispose(() => {
    tempAreaPanel = null;
  });
}

function getTempAreaHtml(content) {
  return `
    <html>
      <body>
        <h3>临时区域内容（可复制）</h3>
        <textarea style="width:100%;height:300px;">${content}</textarea>
      </body>
    </html>
  `;
}

function activateTempArea(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.addToTempArea', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selectedText = editor.document.getText(editor.selection);
        if (selectedText.trim()) {
          addToTempArea(selectedText);
          vscode.window.showInformationMessage('已加入临时区域');
          // 不再自动打开面板
        }
      }
    }),
    vscode.commands.registerCommand('extension.showTempArea', () => {
      showTempAreaPanel(context);
    }),
    vscode.commands.registerCommand('extension.codeFromTempArea', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selectedText = editor.document.getText(editor.selection);
        if (!selectedText.trim() && !tempAreaContent.trim()) {
          vscode.window.showErrorMessage('没有可用内容');
          return;
        }
        const prompt = `上下文信息：\n${tempAreaContent}\n\n当前内容：\n${selectedText}\n\n请根据这些信息生成代码，只输出代码本身。`;
        const openai = getOpenAIInstance();
        const model = getSelectedModel();
        try {
          const response = await openai.completions.create({
              model: model,
              prompt: prompt,
              max_tokens: 1500
          });
          const generatedCode = response.choices[0]?.text.trim();
          if (generatedCode) {
            tempAreaContent = ''; // 清空临时区域
            if (tempAreaPanel) {
              tempAreaPanel.webview.html = getTempAreaHtml(generatedCode);
            } else {
              showTempAreaPanel(context);
              tempAreaPanel.webview.html = getTempAreaHtml(generatedCode);
            }
            vscode.window.showInformationMessage('代码已生成，请在可视化区域复制');
          }
        } catch (error) {
          vscode.window.showErrorMessage('生成代码失败，请检查 API 设置。');
        }
      }
    })
  );
}

module.exports = {
  activateTempArea,
};