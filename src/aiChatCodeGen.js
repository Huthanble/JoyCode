const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { openai } = require('./openaiClient'); // 确保 openaiClient.js 正确配置

function activateAiChatCodeGen(context) {
    // 在创建 Webview 前先获取并缓存编辑器状态
    let fileContent = '';
    let filePath = '';
    let contextFiles = [];
    // 创建一个新的 Webview 面板
    const panel = vscode.window.createWebviewPanel(
        'chatPanel',//类型标识符，用于区分不同的webview面板
        'NaviChat',//面板标题
        vscode.ViewColumn.Beside,//面板显示位置
        {
            enableScripts: true,
            retainContextWhenHidden: true,//保持上下文
        }
    );

    let lastActiveEditor = vscode.window.activeTextEditor; // 缓存当前活动编辑器
     // 定义一个函数来更新当前活动编辑器的内容
     function updateActiveEditorInfo() {
        const editor = vscode.window.activeTextEditor||lastActiveEditor;
        if (editor) {
            const document = editor.document;
            fileContent = document.getText(); // 获取文件内容
            filePath = document.uri.fsPath; // 获取文件路径
            // 获取文件名
            const fileName = path.basename(filePath);
            // 获取文件类型（语言ID，如 'javascript', 'python' 等）
            const fileType = document.languageId;
            lastActiveEditor = editor; // 更新缓存的活动编辑器
            console.log("活动编辑器已更新:");
            console.log("文件路径:", filePath);
            console.log("文件名:", fileName);
            console.log("文件类型:", fileType);
            console.log("文件内容:", fileContent);
            panel.webview.postMessage({
                command: 'fileInfo',
                fileName,
                fileType,
                filePath
            });
        } else {
            // 如果没有活动编辑器，尝试从已打开的文档中获取内容
            const documents = vscode.workspace.textDocuments;
            if (documents.length > 0) {
                const document = documents[0]; // 获取第一个已打开的文档
                fileContent = document.getText();
                filePath = document.uri.fsPath;
                console.log("从已打开的文档中获取内容:");
                console.log("文件路径:", filePath);
                console.log("文件内容:", fileContent);
            } else {
                fileContent = '当前没有活动的编辑器，无法读取文件内容。';
                filePath = '';
                console.log("没有活动的编辑器，也没有已打开的文档。");
            }
        }
    }

    // 初始化时更新活动编辑器信息
    updateActiveEditorInfo();


    // 监听编辑器切换事件，编辑器切换时又调用一次更新编辑器信息
    vscode.window.onDidChangeActiveTextEditor(() => {
        updateActiveEditorInfo();
    });

    
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

    let chatHistory = []; // 初始化聊天历史记录
    // 添加消息到历史记录
    function addToChatHistory(role, content) {
        chatHistory.push({
            role: ['system', 'user', 'assistant'].includes(role) ? role : 'user',
            content: String(content)
        });
        
        // 限制历史记录长度，只保留最近10条
        if (chatHistory.length > 10) {
            chatHistory = chatHistory.slice(-10);
        }
    }

    // 监听前端发送的消息
    panel.webview.onDidReceiveMessage(async (message) => {
        
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
        if (message.command === 'selectContextFile') {
            // 这里可以用 vscode.window.showOpenDialog 让用户选择文件
            // 并把选中的文件路径等信息再 postMessage 回前端
            const options = {
                canSelectMany: false,
                openLabel: '选择文件',
                filters: {
                    'All Files': ['*']
                }
            };
        const uris = await vscode.window.showOpenDialog(options);
        if (uris && uris.length > 0) {
            const fileUri = uris[0];
            const filePath = fileUri.fsPath;
            const fileName = path.basename(filePath);
            let fileContent = '';
            try {
                fileContent = fs.readFileSync(filePath, 'utf-8');
                // 保存到 contextFiles
                contextFiles.push({ fileName, filePath, fileContent });
                // 你可以把文件名发回前端显示
                panel.webview.postMessage({
                    command: 'contextFileAdded',
                    fileName,
                    filePath
                });
            } catch (err) {
                vscode.window.showErrorMessage('读取文件失败: ' + err.message);
            }
        }
    }

    if (message.command === 'askAI') {
        const userInput = message.text;
        const model = message.model || 'deepseek-chat'; // 默认模型
        if (!userInput || userInput.trim() === '') {
            panel.webview.postMessage({ command: "response", text: "输入不能为空，请重新输入。" });
            return;
        }

        addToChatHistory('user', userInput);

        // 拼接上下文文件内容
        let contextPrompt = '';
        if (contextFiles.length > 0) {
            contextPrompt = contextFiles.map(f =>
                `【上下文文件】${f.fileName}\n路径: ${f.filePath}\n内容:\n${f.fileContent}\n`
            ).join('\n');
        }

        try {
            const response = await openai.chat.completions.create({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            `${contextPrompt}\n当前文件路径: ${filePath}\n文件内容:\n${fileContent}\n你是代码助手，请阅读文件内容并回答问题。`
                    },
                    ...chatHistory.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    }))
                ],
                
            });

            const reply = response.choices[0]?.message?.content || "AI 无法生成回复。";
            addToChatHistory('assistant', reply);
            panel.webview.postMessage({ command: "response", text: reply });
        } catch (error) {
            console.error("OpenAI 请求失败:", error);
            panel.webview.postMessage({ command: "response", text: "对不起，AI 无法生成回复。" });
        }    
        }

        if (message.command === 'regenerate'){
            // 取出最后一条用户消息和上下文，重新请求 AI
            // 只允许对最后一轮对话重新生成
            console.log('收到重新生成请求，模型：', message.model);
            const model = message.model || 'deepseek-chat';
            const lastUserMsg = chatHistory.filter(m => m.role === 'user').slice(-1)[0];
            if (!lastUserMsg) return;

            // 重新生成时不重复添加到 chatHistory，只替换最后一条 AI 回复
            let contextPrompt = '';
            if (contextFiles.length > 0) {
                contextPrompt = contextFiles.map(f =>
                    `【上下文文件】${f.fileName}\n路径: ${f.filePath}\n内容:\n${f.fileContent}\n`
                ).join('\n');
            }

            try {
                const response = await openai.chat.completions.create({
                    model,
                    messages: [
                        {
                            role: "system",
                            content:
                                `${contextPrompt}\n当前文件路径: ${filePath}\n文件内容:\n${fileContent}\n你是代码助手，请阅读文件内容并回答问题。`
                        },
                        ...chatHistory.filter(m => m.role !== 'assistant').map(msg => ({
                            role: msg.role,
                            content: msg.content
                        }))
                    ],
                });

                const reply = response.choices[0]?.message?.content || "AI 无法生成回复。";
                // 替换最后一条 assistant 回复
                const lastAiIdx = chatHistory.map(m => m.role).lastIndexOf('assistant');
                if (lastAiIdx !== -1) {
                    chatHistory[lastAiIdx].content = reply;
                } else {
                    chatHistory.push({ role: 'assistant', content: reply });
                }
                panel.webview.postMessage({ command: "response", text: reply });
            } catch (error) {
                console.error("OpenAI 请求失败:", error);
                panel.webview.postMessage({ command: "response", text: "对不起，AI 无法生成回复。" });
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