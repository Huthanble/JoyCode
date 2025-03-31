const vscode = require('vscode');
const { openai } = require('./openaiClient');

async function generateCodeFromComment() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const position = editor.selection.active;
  const lineText = document.lineAt(position.line).text;

  if (!lineText.startsWith('//')) {
    vscode.window.showErrorMessage('请在注释行调用此功能，例如: // 创建一个 REST API 服务器');
    return;
  }

  const prompt = `请根据这个注释生成代码: ${lineText}`;
  try {
    const response = await openai.completions.create({
      model: 'deepseek-chat',
      prompt: prompt,
      max_tokens: 150
    });

    const generatedCode = response.choices[0]?.text.trim();
    if (generatedCode) {
      editor.edit(editBuilder => editBuilder.insert(new vscode.Position(position.line + 1, 0), `\n${generatedCode}\n`));
    }
  } catch (error) {
    console.error('根据注释生成代码出错:', error);
    vscode.window.showErrorMessage('生成代码失败，请检查 API 设置。');
  }
}

function activateCommentToCode(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.commentToCode', generateCodeFromComment)
  );
}

function deactivateCommentToCode(){

}

module.exports = { 
    activateCommentToCode,
    deactivateCommentToCode
 };
