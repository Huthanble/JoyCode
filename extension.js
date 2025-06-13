const vscode = require('vscode');
const { activateCodeCompletion } = require('./src/codeCompletion');
const { activateAiChatCodeGen } = require('./src/aiChatCodeGen');
const { activateCommentToCode } = require('./src/commentToCode');
const {activateTempArea} = require('./src/TempArea');
const { deactivateCodeCompletion } = require('./src/codeCompletion');
const { deactivateAiChatCodeGen } = require('./src/aiChatCodeGen');
const { deactivateCommentToCode } = require('./src/commentToCode');


function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('navicode.switchModel', async () => {
      const config = vscode.workspace.getConfiguration('navicode');
      const currentModel = config.get('selectedModel', 'deepseek-chat');
      const selectedModel = await vscode.window.showQuickPick(
        ['deepseek-chat', 'gpt-4', 'gpt-3.5', 'doubao'],
        { placeHolder: `当前模型: ${currentModel}` }
      );

      if (selectedModel) {
        await config.update('selectedModel', selectedModel, true);
        vscode.window.showInformationMessage(`已切换到模型: ${selectedModel}`);
      }
    })
  );
  activateTempArea(context);
  activateCodeCompletion(context);
  activateCommentToCode(context);
  let disposable = vscode.commands.registerCommand("navicode.openChat", () => {
    // 只有执行 openChat 命令时才会打开 AI Chat 界面
	activateAiChatCodeGen(context);
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
