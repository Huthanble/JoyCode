const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { openai } = require('./openaiClient'); // 确保 openaiClient.js 正确配置

function activateAiChatCodeGen(context) {
    // 在创建 Webview 前先获取并缓存编辑器状态
    let fileContent = '';
    let filePath = '';

     // 定义一个函数来更新当前活动编辑器的内容
     function updateActiveEditorInfo() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            fileContent = document.getText(); // 获取文件内容
            filePath = document.uri.fsPath; // 获取文件路径
            console.log("活动编辑器已更新:");
            console.log("文件路径:", filePath);
            console.log("文件内容:", fileContent);
        } else {
            fileContent = '当前没有活动的编辑器，无法读取文件内容。';
            filePath = '';
            console.log("没有活动的编辑器。");
        }
    }

    // 初始化时更新活动编辑器信息
    updateActiveEditorInfo();

    // 监听编辑器切换事件
    vscode.window.onDidChangeActiveTextEditor(() => {
        updateActiveEditorInfo();
    });

    const panel = vscode.window.createWebviewPanel(
        'chatPanel',
        'AI Chat',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );
    // 生成头像路径
    const userAvatarUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'user.png')));
    const aiAvatarUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'ai.png')));


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

    // 将头像路径注入到 HTML 中
    panel.webview.html = `
        <script>
            const userAvatarUri = "${userAvatarUri}";
            const aiAvatarUri = "${aiAvatarUri}";
        </script>
        ${htmlContent}
    `;
    let chatHistory = [];

    // 添加消息到历史记录
    function addToChatHistory(role, content) {
        chatHistory.push({
            role: ['system', 'user', 'assistant'].includes(role) ? role : 'user',
            content: String(content)
        });
        
        // 限制历史记录长度
        if (chatHistory.length > 10) {
            chatHistory = chatHistory.slice(-10);
        }
    }

    // 监听前端发送的消息
    panel.webview.onDidReceiveMessage(async (message) => {
        if (message.command === 'askAI') {
            const userInput = message.text;

            if (!userInput || userInput.trim() === '') {
                panel.webview.postMessage({ command: "response", text: "输入不能为空，请重新输入。" });
                return;
            }

            addToChatHistory('user', userInput);
            try {
                const response = await openai.chat.completions.create({
                    model: "deepseek-chat",
                    messages: [
                    { role: "system", content: `当前文件路径: ${filePath}\n文件内容:\n${fileContent}` },
                    ...chatHistory.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    }))
                ],
                    temperature: 0.7
                });

                const reply = response.choices[0]?.message?.content || "AI 无法生成回复。";
                addToChatHistory('assistant', reply);
                panel.webview.postMessage({ command: "response", text: reply });
            } catch (error) {
                console.error("OpenAI 请求失败:", error);
                panel.webview.postMessage({ command: "response", text: "对不起，AI 无法生成回复。" });
            }
        }
        if(message.command==='insertCode'){
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                editor.edit((editBuilder) => {
                    editBuilder.insert(editor.selection.active, message.code);
                }).then((success) => {
                    if (success) {
                        vscode.window.showInformationMessage('代码已成功插入到光标位置！');
                    } else {
                        vscode.window.showErrorMessage('代码插入失败，请重试。');
                    }
                });
            } else {
                vscode.window.showErrorMessage('当前没有活动的编辑器，无法插入代码。');
            }
        }
    });

    // 处理面板销毁时的清理
    panel.onDidDispose(() => {
        chatHistory = []; // 清空历史记录
        console.log("AI Chat 面板已关闭。");
    });
}

function deactivateAiChatCodeGen() {}

module.exports = { 
    activateAiChatCodeGen,
    deactivateAiChatCodeGen
};