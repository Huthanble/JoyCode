const { OpenAI } = require('openai');
const vscode = require('vscode');
require('dotenv').config({ path: __dirname + '/.env' });

console.log('当前工作目录:', process.cwd());
console.log('GPT-4 key:', process.env.gpt4);
console.log('GPT-3.5 key:', process.env.gpt35);
console.log('DeepSeek key:', process.env.deepseek);

const gpt4 = process.env.gpt4;
const gpt35 = process.env.gpt35;
const deepseek = process.env.deepseek;
// 配置不同模型的 API 信息
const modelConfigs = {
  'deepseek-chat': {
    baseURL: 'https://api.deepseek.com/beta',
    apiKey: deepseek
  },
  'gpt-4': {
    baseURL: 'https://api.openai.com/v1',
    apiKey: gpt4
  },
  'gpt-3.5': {
    baseURL: 'https://api.openai.com/v1',
    apiKey: gpt35
  }
};

/*
  获取当前选定的模型
  @returns {string} 当前模型名称
 */
function getSelectedModel() {
  const config = vscode.workspace.getConfiguration('navicode');
  return config.get('selectedModel', 'deepseek-chat'); // 默认使用 deepseek-chat
}

/*
  获取 OpenAI 实例，根据当前选定的模型动态配置
  @returns {OpenAI} OpenAI 实例
 */
function getOpenAIInstance() {
  const selectedModel = getSelectedModel();
  const modelConfig = modelConfigs[selectedModel];

  if (!modelConfig) {
    throw new Error(`未找到模型配置: ${selectedModel}`);
  }

  
  return new OpenAI({
    baseURL: modelConfig.baseURL,
    apiKey: modelConfig.apiKey
  });
}

module.exports = { getOpenAIInstance, getSelectedModel };
