// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const { activateCodeCompletion } = require('./src/codeCompletion');
const { activateAiChatCodeGen } = require('./src/aiChatCodeGen');
const { activateCommentToCode } = require('./src/commentToCode');
const { deactivateCodeCompletion } = require('./src/codeCompletion');
const { deactivateAiChatCodeGen } = require('./src/aiChatCodeGen');
const { deactivateCommentToCode } = require('./src/commentToCode');

function activate(context) {
  activateCodeCompletion(context);
  activateCommentToCode(context);
  let disposable = vscode.commands.registerCommand("joycode.openChat", () => {
    // 只有执行 openChat 命令时才会打开 AI Chat 界面
	activateAiChatCodeGen(context);
  });

  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
