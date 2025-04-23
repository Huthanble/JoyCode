const vscode = require('vscode');
const { openai } = require('./openaiClient');


const { detectLanguage, retryWithFeedback } = require('./tools');

async function handleGeneratedCode(userKeywords, generatedCode) {
  const lang = detectLanguage(generatedCode);
  const result = await retryWithFeedback(userKeywords, generatedCode, lang);

  if (result.success) {
    vscode.window.showInformationMessage('代码运行成功 ✅');
  } else {
    vscode.window.showErrorMessage(`运行失败 ❌: ${result.output}`);
  }
}

async function generateCodeFromComment() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const position = editor.selection.active;

    if (!selectedText.startsWith('//')) {
      vscode.window.showErrorMessage('请在注释行调用此功能，例如选中 // 创建一个 REST API 服务器');
      return;
    }

    // 提取初始关键词
    const initialKeywords = selectedText.replace('//', '').trim();

    // 提供输入框让用户修改关键词
    const userKeywords = await vscode.window.showInputBox({
      prompt: '请修改或确认关键词以生成代码',
      value: initialKeywords
    });

    if (!userKeywords) {
      vscode.window.showErrorMessage('关键词不能为空');
      return;
    }


    const languageId = editor.document.languageId;
    const prompt = `请使用${languageId}语言，根据这个注释生成代码: ${userKeywords}`;
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
            handleGeneratedCode(userKeywords, generatedCode);
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

function deactivateCommentToCode() {}

module.exports = { 
    activateCommentToCode,
    deactivateCommentToCode
};