const vscode = require('vscode');
const { openai } = require('./openaiClient');

async function generateCodeFromComment() {
  const editor = vscode.window.activeTextEditor;
  if (editor){

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const position = editor.selection.active;

    if (!selectedText.startsWith('//')) {
      vscode.window.showErrorMessage('请在注释行调用此功能，例如选中 // 创建一个 REST API 服务器');
      return;
    }
    const prompt = `根据这个注释只生成代码: ${selectedText.replace('//', '').trim()}`; 
    console.log('Prompt:', prompt); 
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "正在生成代码...",
        cancellable: false
      },
      async (progress, token) => {
        try {
          const response = await openai.completions.create({
            model: 'deepseek-chat',
            prompt: prompt,
            max_tokens: 1500
          });
    
          const generatedCode = response.choices[0]?.text.trim();
          if (generatedCode) {
            editor.edit(editBuilder => editBuilder.insert(new vscode.Position(position.line + 1, 0), `${generatedCode}\n`));
          }
        } catch (error) {
          vscode.window.showErrorMessage('生成代码失败，请检查 API 设置。');
        }
      }
    );
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
