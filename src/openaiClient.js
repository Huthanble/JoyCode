const { OpenAI } = require('openai');

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com/beta',
  apiKey: 'sk-601be33605994e94a9598bc0794c1900'
});

module.exports = { openai };
