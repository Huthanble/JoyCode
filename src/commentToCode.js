const vscode = require('vscode');
const { getOpenAIInstance,getSelectedModel,modelConfigs} = require('./openaiClient');
const { detectLanguage, runCode } = require('./tools');
const { addToTempArea,showTempAreaPanel} = require('./TempArea');
async function retryWithFeedback(userKeywords, code, lang, maxAttempts = 10) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    const result = await runCode(lang, code);
    if (result.success) return { success: true, code, output: result.message };
    const feedbackPrompt = `你根据以下注释生成了这段代码：\n\n注释: ${userKeywords}\n\n代码：\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n运行时报错如下：\n${result.message}\n\n请只输出修复后的完整代码（无额外解释）`;
    console.log('反馈提示:', feedbackPrompt);
    const openai = getOpenAIInstance();
    const selectedModel = getSelectedModel();
    const model = modelConfigs[selectedModel].model;

    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: `你是一个代码生成助手` },
        { role: 'user', content: feedbackPrompt }
      ],
      max_tokens: 1500
    });
    const newCode = response.choices[0]?.message?.content.trim();

    // const response = await openai.completions.create({
    //   model: model,
    //   prompt: feedbackPrompt,
    //   max_tokens: 1500
    // });

    // const newCode = response.choices[0]?.text.trim();
    code = newCode;
    attempt++;
  }
  console.log('多次优化失败，返回原始代码');
  return { success: false, code, output: '多次优化失败，请手动检查。' };
}

async function handleGeneratedCode(userKeywords, generatedCode, languageId) {
  const lang = detectLanguage(generatedCode, languageId);
  const result = await retryWithFeedback(userKeywords, generatedCode, lang);

  if (result.success) {
    vscode.window.showInformationMessage('代码运行成功 ✅');
    return result.code;
  } else {
    vscode.window.showErrorMessage(`运行失败 ❌: ${result.output}`);
    return generatedCode; 
  }
}

async function generateCodeFromComment() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const position = editor.selection.active;

    if (!selectedText.trim()) {
      vscode.window.showErrorMessage('选中的内容不能为空');
      return;
    }

    if (selectedText.startsWith('//')) {
      // 如果选中的是注释，生成代码
      const initialKeywords = selectedText.replace('//', '').trim();
      const languageId = editor.document.languageId;
      const prompt = `请使用${languageId}语言，根据这个注释生成代码: ${initialKeywords}`;
      const userKeywords = await vscode.window.showInputBox({
        prompt: '请修改或确认关键词以生成代码',
        value: initialKeywords
      });

      if (!userKeywords) {
        vscode.window.showErrorMessage('关键词不能为空');
        return;
      }


      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "正在生成代码...",
          cancellable: false
        },
        async (progress, token) => {
          try {
            const openai = getOpenAIInstance();
            const selectedModel = getSelectedModel();
            const model = modelConfigs[selectedModel].model;
            let response,generatedCode;
            console.log('当前模型:', model);
            if (!model) {
              response=openai.responses.create({
                model: model,
                input: prompt,
                store: true
              });
              generatedCode = response;
            }else{
              response = await openai.chat.completions.create({
                model: model,
                messages: [
                  { role: 'system', content: `你是一个${languageId}代码生成助手` },
                  { role: 'user', content: prompt }
                ],
                max_tokens: 1500
              });
              generatedCode = response.choices[0]?.message?.content.trim();
            }
            
            // const response = await openai.completions.create({
            //   model: model,
            //   prompt: prompt,
            //   max_tokens: 1500
            // });
            // const generatedCode = response.choices[0]?.text.trim();
            
            if (generatedCode) {
              const finalCode=await handleGeneratedCode(userKeywords, generatedCode, languageId);
              editor.edit(editBuilder => editBuilder.insert(new vscode.Position(position.line + 1, 0), `${finalCode}\n`));
            }
          } catch (error) {
            console.error('OpenAI API 错误:', error?.response?.data || error.message || error);
            vscode.window.showErrorMessage('生成代码失败，请检查 API 设置。');
          }
        }
      );
    } else {
      // 如果选中的是代码，生成注解
      const languageId = editor.document.languageId;
      const prompt = `请为以下${languageId}代码生成详细的注解：\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
      console.log('Prompt:', prompt);

      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "正在生成注解...",
          cancellable: false
        },
        async (progress, token) => {
          try {
            const openai = getOpenAIInstance();
            const selectedModel = getSelectedModel();
            const model = modelConfigs[selectedModel].model;

            const response = await openai.chat.completions.create({
              model: model,
              messages: [
                { role: 'system', content: `你是一个${languageId}代码生成助手` },
                { role: 'user', content: prompt }
              ],
              max_tokens: 1500
            });
            const generatedComment = response.choices[0]?.message?.content.trim();

            // const response = await openai.completions.create({
            //   model: model,
            //   prompt: prompt,
            //   max_tokens: 500
            // });

            // const generatedComment = response.choices[0]?.text.trim();
            if (generatedComment) {
              showTempAreaPanel();
              addToTempArea(generatedComment);
              vscode.window.showInformationMessage('注解生成成功 ✅');
            }
          } catch (error) {
            vscode.window.showErrorMessage('生成注解失败，请检查 API 设置。');
          }
        }
      );
    }
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