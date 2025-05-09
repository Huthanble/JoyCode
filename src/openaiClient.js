const { OpenAI } = require('openai');
const vscode = require('vscode');

// 配置不同模型的 API 信息
const modelConfigs = {
  'deepseek-chat': {
    baseURL: 'https://api.deepseek.com/beta',
    apiKey: 'sk-601be33605994e94a9598bc0794c1900'
  },
  'gpt-4': {
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'sk-'
  },
  'gpt-3.5': {
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'sk-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
  }
};

/**
 * 获取当前选定的模型
 * @returns {string} 当前模型名称
 */
function getSelectedModel() {
  const config = vscode.workspace.getConfiguration('navicode');
  return config.get('selectedModel', 'deepseek-chat'); // 默认使用 deepseek-chat
}

/**
 * 获取 OpenAI 实例，根据当前选定的模型动态配置
 * @returns {OpenAI} OpenAI 实例
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
