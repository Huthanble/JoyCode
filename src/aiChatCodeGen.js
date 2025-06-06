const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { getOpenAIInstance, getSelectedModel } = require('./openaiClient');
const openai = getOpenAIInstance();
class ChatViewProvider {
  constructor(context) {
    this.context = context;
    this.chatHistoryPath = path.join(context.extensionPath, 'chatHistory.json');
    this.systemPromptPath = path.join(context.extensionPath, 'systemPrompt.json');
    this.chatTitle='';
    // 初始化数据
    this.fileContent = '';
    this.filePath = '';
    this.contextFiles = [];
    this.chatHistory = [];
    this.lastActiveEditor = vscode.window.activeTextEditor;
    
    // 系统提示数据
    this.systemPromptData = {
      aiRole: '假设你是一名经验丰富的编程导师，能提供实用的建议和指导',
      aiScenario: '帮助用户了解编程基础和核心概念。通过实际项目实践和提高编程技能。',
      aiStyle: '通俗易懂、详细分步讲解。学习用户的代码风格，模仿用户的代码风格来编写代码',
      aiOutput: 'Markdown代码块、用户用何种语言提问，就用何种语言回答'
    };
    
    this.loadSystemPrompt();
    this.loadChatHistory();
    
    // 监听编辑器变化
    vscode.window.onDidChangeActiveTextEditor(() => {
      this.updateActiveEditorInfo();
    });
  }
  
  loadSystemPrompt() {
    try {
      if (fs.existsSync(this.systemPromptPath)) {
        this.systemPromptData = JSON.parse(fs.readFileSync(this.systemPromptPath, 'utf-8'));
      }
    } catch (e) {
      console.error('读取 systemPrompt.json 失败:', e);
    }
  }
  
  loadChatHistory() {
    try {
      if (fs.existsSync(this.chatHistoryPath)) {
        this.chatHistory = JSON.parse(fs.readFileSync(this.chatHistoryPath, 'utf-8'));
      }
    } catch (e) {
      this.chatHistory = [];
    }
  }
  
  saveChatHistory() {
    try {
      fs.writeFileSync(this.chatHistoryPath, JSON.stringify(this.chatHistory, null, 2), 'utf-8');
    } catch (e) {
      console.error('保存聊天记录失败:', e);
    }
  }
  
  updateActiveEditorInfo() {
    const editor = vscode.window.activeTextEditor || this.lastActiveEditor;
    if (editor) {
      const document = editor.document;
      this.fileContent = document.getText();
      this.filePath = document.uri.fsPath;
      const fileName = path.basename(this.filePath);
      const fileType = document.languageId;
      this.lastActiveEditor = editor;
      
      if (this.webviewView) {
        this.webviewView.webview.postMessage({
          command: 'fileInfo',
          fileName,
          fileType,
          filePath: this.filePath
        });
      }
    } else {
      const documents = vscode.workspace.textDocuments;
      if (documents.length > 0) {
        const document = documents[0];
        this.fileContent = document.getText();
        this.filePath = document.uri.fsPath;
      } else {
        this.fileContent = '当前没有活动的编辑器，无法读取文件内容。';
        this.filePath = '';
      }
    }
  }

  resolveWebviewView(webviewView) {
    this.webviewView = webviewView;
    
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'media'))]
    };

    // 生成头像路径
    const userAvatarUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'user.png'))
    );
    const aiAvatarUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'ai.png'))
    );
    const robotImgUri = webviewView.webview.asWebviewUri(
      vscode.Uri.file(path.join(this.context.extensionPath, 'media', 'robot-img.svg'))
    );

    // 读取 index.html
    const htmlPath = path.join(this.context.extensionPath, 'media', 'index.html');
    let htmlContent;
    try {
      htmlContent = fs.readFileSync(htmlPath, 'utf8');
      htmlContent = htmlContent.replace(/__ROBOT_IMG_URI__/g, robotImgUri);
    } catch (error) {
      console.error("无法读取 HTML 文件:", error);
      vscode.window.showErrorMessage("无法加载聊天窗口的 HTML 文件。");
      return;
    }
    
    // 将头像路径注入到 HTML 中
    webviewView.webview.html = `
      <script>
        const userAvatarUri = "${userAvatarUri}";
        const aiAvatarUri = "${aiAvatarUri}";
      </script>
      ${htmlContent}
    `;

    // 初始化编辑器信息
    this.updateActiveEditorInfo();
    
    // 发送系统提示数据
    setTimeout(() => {
      webviewView.webview.postMessage({
        command: 'initSystemPrompt',
        data: this.systemPromptData
      });
      
      // 发送聊天历史
      if (this.chatHistory.length > 0) {
        webviewView.webview.postMessage({
          command: 'initChatHistory',
          history: this.chatHistory
        });
      }
    }, 300);
    
    // 处理前端消息
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'saveSystemPrompt':
          try {
            fs.writeFileSync(this.systemPromptPath, JSON.stringify(message.data, null, 2), 'utf-8');
            this.systemPromptData = message.data;
          } catch (e) {
            vscode.window.showErrorMessage('保存System Prompt失败: ' + e.message);
          }
          break;
          
        case 'removeContextFile':
          this.contextFiles = this.contextFiles.filter(f => f.filePath !== message.filePath);
          webviewView.webview.postMessage({
            command: 'contextFiles',
            files: this.contextFiles
          });
          break;
          
        case 'insertCode':
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
          break;
          
        case 'selectContextFile':
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
            try {
              const fileContent = fs.readFileSync(filePath, 'utf-8');
              this.contextFiles.push({ fileName, filePath, fileContent });
              webviewView.webview.postMessage({
                command: 'contextFiles',
                files: this.contextFiles
              });
            } catch (err) {
              vscode.window.showErrorMessage('读取文件失败: ' + err.message);
            }
          }
          break;
          
        case 'askAI':
          await this.handleAiRequest(message, webviewView);
          break;
          
        case 'regenerate':
          await this.handleRegenerateRequest(message, webviewView);
          break;

        case 'newChatWindow':
          // 处理新建聊天窗口的逻辑
          this.chatHistory = [];
          this.saveChatHistory();
          // 通知前端清空消息
          webviewView.webview.postMessage({
                command: 'clearChat'
            });
          break;
      }
    });
  }
  
  async handleAiRequest(message, webviewView) {
    const userInput = message.text;
    const model = message.model || 'deepseek-chat';
    const systemPrompt = message.systemPrompt || '你是代码助手，请用简洁、专业的方式回答用户问题。';
    
    if (!userInput || userInput.trim() === '') {
      webviewView.webview.postMessage({ command: "response", text: "输入不能为空，请重新输入。" });
      return;
    }
    
    this.chatHistory.push({
      role: 'user',
      content: String(userInput)
    });
    
    if (this.chatHistory.length > 50) {
      this.chatHistory = this.chatHistory.slice(-50);
    }
    this.saveChatHistory();
    
    // 准备上下文提示
    let contextPrompt = '';
    if (this.contextFiles.length > 0) {
      contextPrompt = this.contextFiles.map(f =>
        `【上下文文件】${f.fileName}\n路径: ${f.filePath}\n内容:\n${f.fileContent}\n`
      ).join('\n');
    }
    
    try {
        const isFirstQuestion = this.chatHistory.filter(m => m.role === 'user').length === 1 && !this.chatTitle;

      let reply = '';
      let chatTitle = '';

      if (isFirstQuestion) {
        // 让AI同时返回回答和标题
        const response = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                `${contextPrompt}\n当前文件路径: ${this.filePath}\n文件内容:\n${this.fileContent}\n${systemPrompt}\n请先回答用户问题，然后用一句话总结本次对话主题，格式为：\n【标题】xxxx`
            },
            ...this.chatHistory.map(msg => ({
              role: msg.role,
              content: msg.content
            }))
          ],
        });

        const fullReply = response.choices[0]?.message?.content || "AI 无法生成回复。";
        // 提取标题
        const match = fullReply.match(/【标题】(.+)/);
        if (match) {
          reply = fullReply.replace(/【标题】.+/, '').trim();
          chatTitle = match[1].trim();
        } else {
          reply = fullReply;
          chatTitle = userInput.slice(0, 20); // 兜底
        }
        this.chatTitle = chatTitle;
        // 通知前端显示标题
        webviewView.webview.postMessage({ command: "setChatTitle", title: chatTitle });
      } else {
        // 普通回复
        const response = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: "system",
              content:
                `${contextPrompt}\n当前文件路径: ${this.filePath}\n文件内容:\n${this.fileContent}\n${systemPrompt}`
            },
            ...this.chatHistory.map(msg => ({
              role: msg.role,
              content: msg.content
            }))
          ],
        });
        reply = response.choices[0]?.message?.content || "AI 无法生成回复。";
      }

      this.chatHistory.push({
        role: 'assistant',
        content: String(reply)
      });

      if (this.chatHistory.length > 50) {
        this.chatHistory = this.chatHistory.slice(-50);
      }
      this.saveChatHistory();

      webviewView.webview.postMessage({ command: "response", text: reply });
    } catch (error) {
      console.error("OpenAI 请求失败:", error);
      webviewView.webview.postMessage({ command: "response", text: "对不起，AI 无法生成回复。" });
    }
  }
  
  async handleRegenerateRequest(message, webviewView) {
    const model = message.model || 'deepseek-chat';
    const lastUserMsg = this.chatHistory.filter(m => m.role === 'user').slice(-1)[0];
    if (!lastUserMsg) return;
    
    // 准备上下文提示
    let contextPrompt = '';
    if (this.contextFiles.length > 0) {
      contextPrompt = this.contextFiles.map(f =>
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
              `${contextPrompt}\n当前文件路径: ${this.filePath}\n文件内容:\n${this.fileContent}\n你是代码助手，请阅读文件内容并回答问题。`
          },
          ...this.chatHistory.filter(m => m.role !== 'assistant').map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        ],
      });
      
      const reply = response.choices[0]?.message?.content || "AI 无法生成回复。";
      const lastAiIdx = this.chatHistory.map(m => m.role).lastIndexOf('assistant');
      
      if (lastAiIdx !== -1) {
        this.chatHistory[lastAiIdx].content = reply;
      } else {
        this.chatHistory.push({ role: 'assistant', content: reply });
      }
      
      if (this.chatHistory.length > 50) {
        this.chatHistory = this.chatHistory.slice(-50);
      }
      this.saveChatHistory();
      
      webviewView.webview.postMessage({ command: "response", text: reply });
    } catch (error) {
      console.error("OpenAI 请求失败:", error);
      webviewView.webview.postMessage({ command: "response", text: "对不起，AI 无法生成回复。" });
    }
  }
}

module.exports = ChatViewProvider;