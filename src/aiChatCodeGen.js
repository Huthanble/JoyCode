const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { openai } = require('./openaiClient'); // 确保 openaiClient.js 正确配置

function activateAiChatCodeGen(context) {
    const panel = vscode.window.createWebviewPanel(
        'chatPanel',
        'AI Chat',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );

    // 读取 index.html
    const htmlPath = path.join(context.extensionPath, 'media', 'index.html');
    let htmlContent;

    try {
        htmlContent = fs.readFileSync(htmlPath, 'utf8');
    } catch (error) {
        console.error("无法读取 HTML 文件:", error);
        vscode.window.showErrorMessage("无法加载聊天窗口的 HTML 文件。");
        return;
    }

    panel.webview.html = htmlContent;

    // 监听前端发送的消息
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'askAI') {
            const userInput = message.text;

            if (!userInput || userInput.trim() === '') {
                panel.webview.postMessage({ command: "response", text: "输入不能为空，请重新输入。" });
                return;
            }

            try {
                const response = await openai.chat.completions.create({
                    model: "deepseek-chat",
                    messages: [{ role: "user", content: userInput }],
                });

                const reply = response.choices[0]?.message?.content || "AI 无法生成回复。";
                panel.webview.postMessage({ command: "response", text: reply });
            } catch (error) {
                console.error("OpenAI 请求失败:", error);
                panel.webview.postMessage({ command: "response", text: "对不起，AI 无法生成回复。" });
            }
        }
    });

    // 处理面板销毁时的清理
    panel.onDidDispose(() => {
        console.log("AI Chat 面板已关闭。");
    });
}

function deactivateAiChatCodeGen() {}

module.exports = { 
    activateAiChatCodeGen,
    deactivateAiChatCodeGen
};