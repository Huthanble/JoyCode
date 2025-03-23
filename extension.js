const vscode = require('vscode');

const axios = require('axios');

/**
 * 插件激活时执行
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('AI代码补全插件已激活');

    // 注册内联补全提供者
    const inlineCompletionProvider = vscode.languages.registerInlineCompletionItemProvider(
        [
            { scheme: 'file', language: 'javascript' },
            { scheme: 'file', language: 'typescript' },
            { scheme: 'file', language: 'python' },
            { scheme: 'file', language: 'java' },
            { scheme: 'file', language: 'c' },
            { scheme: 'file', language: 'cpp' }
        ],
        new AICodeCompletionProvider()
    );

    // 添加状态栏项
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.text = '$(sparkle) AI补全';
    statusBarItem.tooltip = 'AI代码补全已启用';
    statusBarItem.show();

    // 注册命令
    const toggleCommand = vscode.commands.registerCommand('aiCodeCompletion.toggle', () => {
        const config = vscode.workspace.getConfiguration('aiCodeCompletion');
        const isEnabled = config.get('enabled');
        config.update('enabled', !isEnabled, true);
        statusBarItem.text = !isEnabled ? '$(sparkle) AI补全' : '$(stop) AI补全已禁用';
        vscode.window.showInformationMessage(`AI代码补全已${!isEnabled ? '启用' : '禁用'}`);
    });

    statusBarItem.command = 'aiCodeCompletion.toggle';
    
    context.subscriptions.push(inlineCompletionProvider, statusBarItem, toggleCommand);
}

/**
 * AI代码补全提供者
 */
class AICodeCompletionProvider {
    // 提供内联补全项
    async provideInlineCompletionItems(document, position, context, token) {
        // 检查是否启用
        const config = vscode.workspace.getConfiguration('aiCodeCompletion');
        if (!config.get('enabled')) {
            return null;
        }
        
        try {
            // 获取当前行文本
            const lineText = document.lineAt(position.line).text;
            const textBeforeCursor = lineText.substring(0, position.character);
            
            // 如果当前行为空或只有空格，则不提供补全
            if (textBeforeCursor.trim() === '') {
                return null;
            }
            
            // 获取上下文代码（前后各10行）
            const startLine = Math.max(0, position.line - 10);
            const endLine = Math.min(document.lineCount - 1, position.line + 10);
            
            let contextCode = '';
            for (let i = startLine; i <= endLine; i++) {
                contextCode += document.lineAt(i).text + '\n';
            }
            
            // 获取文件语言
            const language = document.languageId;
            
            // 调用AI获取补全建议
            const suggestion = await this.getAICompletionSuggestion(
                textBeforeCursor,
                contextCode,
                language
            );
            
            if (!suggestion || suggestion.trim() === '') {
                return null;
            }
            
            // 创建内联补全项
            const item = new vscode.InlineCompletionItem(
                suggestion,
                new vscode.Range(position, position)
            );
            
            return [item];
        } catch (error) {
            console.error('AI代码补全错误:', error);
            return null;
        }
    }
    
    /**
     * 调用AI获取代码补全建议
     * @param {string} currentText 光标前的文本
     * @param {string} contextCode 上下文代码
     * @param {string} language 编程语言
     * @returns {Promise<string>} 补全建议
     */
    async getAICompletionSuggestion(currentText, contextCode, language) {
        // 从设置中获取API配置
        const config = vscode.workspace.getConfiguration('aiCodeCompletion');
        const apiKey = config.get('apiKey');
        const endpoint = config.get('endpoint');
        
        if (!apiKey || !endpoint) {
            vscode.window.showWarningMessage('请配置AI模型API密钥和端点');
            return '';
        }
        
        try {
            // 模拟API调用，正式使用时替换为实际的API调用
            // 这里展示的是OpenAI API的调用方式，可以替换为其他模型的API
            const response = await axios.post(
                endpoint,
                {
                    model: config.get('model') || 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: `你是代码补全助手。针对${language}语言提供简洁准确的代码补全建议。`
                        },
                        {
                            role: 'user',
                            content: `上下文代码:\n${contextCode}\n\n当前输入: ${currentText}\n补全建议:`
                        }
                    ],
                    temperature: 0.2,
                    max_tokens: 150,
                    top_p: 1.0,
                    frequency_penalty: 0.0,
                    presence_penalty: 0.0,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            
            // 仅在调试时使用的模拟响应
            // 实际项目中应该直接使用 response.data.choices[0].message.content
            const mockResponses = {
                'javascript': ' console.log("Hello World!");',
                'python': ' print("Hello World!")',
                'java': ' System.out.println("Hello World!");',
                'c': ' printf("Hello World!\\n");',
                'cpp': ' std::cout << "Hello World!" << std::endl;',
                'typescript': ' console.log("Hello World!");'
            };
            
            // 是否使用模拟响应（仅用于开发时无API密钥的情况）
            const useMockResponse = config.get('useMockResponseForTesting') || false;
            
            if (useMockResponse) {
                return mockResponses[language] || '';
            }
            
            // 正式调用时使用的代码
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('AI API调用错误:', error);
            return '';
        }
    }
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
