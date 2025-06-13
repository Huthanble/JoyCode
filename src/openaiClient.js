
const { OpenAI } = require('openai');
const vscode = require('vscode');
const axios = require('axios').default;
require('dotenv').config({ path: __dirname + '/.env' });

const openaikey = process.env.openaikey;
const deepseek = process.env.deepseek;
const doubao = process.env.doubao;
// 配置不同模型的 API 信息
const modelConfigs = {
  'deepseek-chat': {
    baseURL: 'https://api.deepseek.com/beta',
    apiKey: deepseek,
    model:'deepseek-chat'
  },
  'gpt-4': {
    baseURL: 'https://api.openai.com/v1',
    apiKey: openaikey,
    model: 'gpt-4.1'
  },
  'gpt-3.5': {
    baseURL: 'https://api.openai.com/v1',
    apiKey: openaikey,
    model: 'gpt-3.5-turbo'
  },
  'doubao':{
    baseURL:'https://ark.cn-beijing.volces.com/api/v3/',
    apiKey: doubao,
    model: 'doubao-seed-1.6-250615'
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
    apiKey: modelConfig.apiKey,
  });
}

module.exports = { getOpenAIInstance, getSelectedModel,modelConfigs };
