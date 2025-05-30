let embedder = null;
async function getLocalEmbedder() {
  if (!embedder) {
    const { pipeline } = await import('@xenova/transformers');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedder;
}


/**
 * 获取文本 embedding
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  const embedder = await getLocalEmbedder();
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data); // 返回 float32 embedding 数组
}

module.exports = { getEmbedding };
