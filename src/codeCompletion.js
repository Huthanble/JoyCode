const vscode = require("vscode");
const { OpenAI } = require("openai");
const path = require("path");
const { execSync } = require("child_process");
const fs = require("fs");
const { getOpenAIInstance, getSelectedModel } = require("./openaiClient");
const Handlebars = require("handlebars");
const glob = require("glob");
const { HNSWLib } = require("@langchain/community/vectorstores/hnswlib");
const { OpenAIEmbeddings } = require("@langchain/openai"); // 用于检索时自动embedding
const { getEmbedding } = require('./embedding-local');
const Parser = require('tree-sitter');

// 导入各种语言的语法解析器
const LANG_MAP = {
  '.js': require('tree-sitter-javascript'),
  '.ts': require('tree-sitter-javascript'),
  '.tsx': require('tree-sitter-javascript'),
  '.jsx': require('tree-sitter-javascript'),
  '.py': require('tree-sitter-python'),
  '.java': require('tree-sitter-java'),
  '.c': require('tree-sitter-c'),
  '.h': require('tree-sitter-c'),
  '.cpp': require('tree-sitter-cpp'),
  '.cc': require('tree-sitter-cpp'),
  '.hpp': require('tree-sitter-cpp'),
  // 可根据需要添加其他语言
};

// 包装一个兼容 langchain 的 embedding 对象
class LocalEmbeddings {
  async embedDocuments(texts) {
    // texts: string[]
    return Promise.all(texts.map(t => getEmbedding(t)));
  }
  async embedQuery(text) {
    return getEmbedding(text);
  }
}

// 用于显示加载提示的装饰器
let loadingDecorationType = null;
// 标记是否由命令手动触发
let isManuallyTriggered = false;

/**
 * 显示加载提示
 * @param {vscode.TextEditor} editor - 当前编辑器
 */
function showLoadingIndicator(editor) {
  if (!editor) return;

  // 清除之前的加载提示
  hideLoadingIndicator();

  // 创建新的装饰类型
  loadingDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: "代码生成中...",
      color: "#888888",
      fontStyle: "italic",
    },
  });

  // 在光标位置显示加载提示
  const position = editor.selection.active;
  const range = new vscode.Range(position, position);
  editor.setDecorations(loadingDecorationType, [range]);
}

/**
 * 隐藏加载提示
 */
function hideLoadingIndicator() {
  if (loadingDecorationType) {
    // 获取所有编辑器
    vscode.window.visibleTextEditors.forEach((editor) => {
      editor.setDecorations(loadingDecorationType, []);
    });
    loadingDecorationType.dispose();
    loadingDecorationType = null;
  }
}

/**
 * 使用大模型生成补全建议
 * @param {vscode.TextDocument} document - 当前文档
 * @param {vscode.Position} position - 光标位置
 * @returns {Promise<string|null>} - 返回补全建议或 null
 */
async function getSuggestion(document, position) {
  const openai = getOpenAIInstance();
  const model = getSelectedModel();

  const fullText = document.getText();
  const cursorOffset = document.offsetAt(position);
  const prompt = fullText.slice(0, cursorOffset);
  const suffix = fullText.slice(cursorOffset);

  // 查询本地向量数据库，获取 ragContext
  let ragContext = "";

  if (isRagEnabled()) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const rootDir = workspaceFolders[0].uri.fsPath;
      // 你可以根据实际情况调整 topN
      ragContext = await getRagContext(prompt, 5, rootDir, document);

      console.log("rag:",ragContext);
    }
  }

  // 获取用户自定义提示词
  const customPrompt = getCustomPrompt(document);

  // 获取关联文件内容
  const relatedFiles = await getRelatedFilesContent(document);

  // 读取 README
  const readme = getReadmeContent();

  // 读取当前文件 diff
  const fileDiff = getCurrentFileDiff(document);

  // 如果文件大小超出限制，显示提示
  if (relatedFiles.truncated) {
    vscode.window
      .showWarningMessage(
        "相关文件长度过长，相关文件内容会被截取，请考虑是否要关闭相关文件功能",
        "关闭相关文件功能",
        "继续"
      )
      .then((selection) => {
        if (selection === "关闭相关文件功能") {
          vscode.workspace
            .getConfiguration("navicode")
            .update("enableRelatedFiles", false, true);
          vscode.window.showInformationMessage("已关闭相关文件功能");
        }
      });
  }

  try {
    // 在 getSuggestion 开头，读取用户模板
    const config = vscode.workspace.getConfiguration("navicode");
    // 所有模板数组
    const templates = config.get("templates", []);
    // 当前激活模板 ID
    const activeId = config.get("activeTemplate", "default");
    // 找到当前模板对象，找不到就 fallback 到第一个或默认模板
    const activeTplObj = templates.find((t) => t.id === activeId) ||
      templates[0] || {
        template:
          " /* 用户提示 */\n{{customPrompt}}\n\n{{#if includeReadme}}\n/* README */\n```\n{{readme}}\n```\n{{/if}}\n\n{{#if includeDiff}}\n/* DIFF */\n```diff\n{{fileDiff}}\n```\n{{/if}}\n\n{{#if includeRelatedFiles}}\n/* 关联文件 */\n{{#each relatedFiles}}文件: {{this.path}}\n```\n{{this.content}}\n```\n{{/each}}\n{{/if}}\n\n/* 上下文 */\n文件: {{fileName}}\n语言: {{languageId}}\n前缀代码:\n{{prefix}}",
      };
    const tplString = activeTplObj.template;
    // 用 Handlebars 编译
    const template = Handlebars.compile(tplString, { noEscape: true });

    const vars = {
      customPrompt,
      fileName: path.basename(document.fileName),
      languageId: document.languageId,
      prefix: prompt,
      includeReadme: Boolean(readme.content),
      readme: readme.content,
      includeDiff: Boolean(fileDiff.diff),
      fileDiff: fileDiff.diff,
      includeRelatedFiles: relatedFiles.files.length > 0,
      relatedFiles: relatedFiles.files,
      ragContext, // 新增
    };
    const promptWithContext = template(vars);

    console.log("当前使用模板：", activeTplObj.name);

    console.log(
      "自动代码补全开关：",
      vscode.workspace
        .getConfiguration("navicode")
        .get("enableAutoTrigger", true)
    );
    console.log(
      "文件上下文开关：",
      vscode.workspace
        .getConfiguration("navicode")
        .get("enableRelatedFiles", true)
    );
    console.log(
      "Git变更历史开关：",
      vscode.workspace.getConfiguration("navicode").get("enableGitDiff", true)
    );
    console.log(
      "查询README开关：",
      vscode.workspace.getConfiguration("navicode").get("enableReadme", true)
    );
    console.log(
      "查询纯净模式开关：",
      vscode.workspace.getConfiguration("navicode").get("enablePurity", true)
    );
    console.log(
      "查询Rag开关：",
      vscode.workspace.getConfiguration("navicode").get("enableRag", true)
    );

    if (isPurittyEnabled()) {
      //纯粹代码前缀版本
      console.log(
        "生成的前文（提示词+README+关联文件+github仓库提交记录+当前代码）：\n",
        prompt
      );
      const response = await openai.completions.create({
        model: model,
        prompt: prompt,
        suffix: suffix,
        max_tokens: 200,
        temperature: 0.5,
        stop: ["\n\n"],
      });
      return response.choices[0].text.trim();
    } else {
      console.log(
        "生成的前文（提示词+README+关联文件+github仓库提交记录+当前代码）：\n",
        promptWithContext
      );
      const response = await openai.completions.create({
        model: model,
        prompt: promptWithContext,
        suffix: suffix,
        max_tokens: 200,
        temperature: 0.5,
        stop: ["\n\n"],
      });
      return response.choices[0].text.trim();
    }
  } catch (error) {
    console.error("调用", vscode.workspace.getConfiguration("navicode").get("selectedModel", 'deepseek-chat'));
    console.error("API 出错:", error);
    return null;
  }
}

/**
 * 查询本地向量数据库，返回最相关的代码片段拼接成字符串
 * @param {string} queryText - 查询文本
 * @param {number} topN - 返回前N个片段
 * @param {string} rootDir - 仓库根目录
 * @param {vscode.TextDocument} document - 当前文档
 * @returns {Promise<string>} - 拼接好的上下文字符串
 */
async function getRagContext(queryText, topN, rootDir, document) {
  // 在查询时构建仓库
  await buildRagRepositoryOnDemand(rootDir, document);
  
  const results = await queryRagSnippetsHNSW(queryText, topN, rootDir);
  return results
    .map(
      (snip) => `文件: ${snip.file} 行: ${snip.start}-${snip.end}\n${snip.text}`
    )
    .join("\n---\n");
}

/**
 * 根据当前文件的头文件依赖关系构建RAG仓库
 * @param {string} rootDir - 仓库根目录
 * @param {vscode.TextDocument} document - 当前文档
 * @returns {Promise<void>}
 */
async function buildRagRepositoryOnDemand(rootDir, document) {
  const tempFilePath = path.join(rootDir, ".navicode_temp");
  const currentFilePath = document.fileName;
  const dbPath = path.join(rootDir, ".navicode_hnsw");
  
  try {
    // 检查是否需要重建仓库
    let needRebuild = true;
    
    if (fs.existsSync(tempFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
        if (data.lastFile === currentFilePath) {
          needRebuild = false;
        } else {
          console.log(`文件已切换: ${data.lastFile} -> ${currentFilePath}，重建仓库`);
        }
      } catch (e) {
        console.error("读取临时文件失败:", e);
      }
    }
    
    if (!needRebuild) {
      return;
    }
    
    // 彻底清除旧的向量数据库
    hnswStore = null;
    if (fs.existsSync(dbPath)) {
      try {
        // 强制删除旧的数据库文件
        fs.rmSync(dbPath, { recursive: true, force: true });
        console.log("已删除旧的向量数据库");
      } catch (err) {
        console.error("删除旧数据库失败:", err);
      }
    }
    
    // 查找当前文件的头文件依赖
    const relatedFiles = await findHeaderDependencies(document, rootDir);
    
    // 创建新的空仓库实例
    const store = new HNSWLib(
      new LocalEmbeddings(),
      { space: "cosine" }
    );
    
    if (relatedFiles.length > 0) {
      // 只处理相关文件，不包含当前文件
      const chunks = [];
      
      // 添加相关文件
      for (const file of relatedFiles) {
        if (file === currentFilePath) continue; // 确保跳过当前文件
        
        try {
          const content = fs.readFileSync(file, "utf8");
          const fileChunks = splitByTreeSitter(content, file);
          
          fileChunks.forEach(chunk => {
            chunks.push({
              id: `${path.relative(rootDir, file)}_${chunk.start}_${chunk.end}`,
              file: path.relative(rootDir, file),
              start: chunk.start,
              end: chunk.end,
              text: chunk.text,
            });
          });
        } catch (error) {
          console.error(`读取相关文件失败: ${file}`, error);
        }
      }
      
      // 如果有块，添加到新仓库
      if (chunks.length > 0) {
        const docs = chunks.map(chunk => ({
          pageContent: chunk.text,
          metadata: {
            file: chunk.file,
            start: chunk.start,
            end: chunk.end,
            id: chunk.id,
          },
        }));
        await store.addDocuments(docs);
      }
    }
    
    // 保存新仓库
    await store.save(dbPath);
    hnswStore = store;
    
    // 保存仓库状态
    fs.writeFileSync(tempFilePath, JSON.stringify({
      lastFile: currentFilePath,
      timestamp: new Date().toISOString(),
      fileCount: relatedFiles.length
    }));
    
    console.log(`新仓库已构建，包含 ${relatedFiles.length} 个相关文件`);
    
  } catch (error) {
    console.error("构建RAG仓库失败:", error);
    // 构建失败时，创建一个空仓库
    hnswStore = new HNSWLib(new LocalEmbeddings(), { space: "cosine" });
    await hnswStore.save(dbPath);
  }
}



/**
 * 查找当前文件的头文件依赖
 * @param {vscode.TextDocument} document - 当前文档
 * @param {string} rootDir - 仓库根目录
 * @returns {Promise<string[]>} - 相关文件路径列表
 */
async function findHeaderDependencies(document, rootDir) {
  const filePath = document.fileName;
  const content = document.getText();
  const language = document.languageId;
  
  // 收集所有相关文件
  const relatedFiles = new Set();
  const visited = new Set();
  
  // 递归查找依赖
  await findDependenciesRecursive(filePath, language, rootDir, relatedFiles, visited);
  
  // 转换为数组，并过滤掉当前文件
  return Array.from(relatedFiles).filter(file => file !== filePath);
}

/**
 * 递归查找文件依赖
 * @param {string} filePath - 文件路径
 * @param {string} language - 语言类型
 * @param {string} rootDir - 仓库根目录
 * @param {Set<string>} relatedFiles - 收集的相关文件
 * @param {Set<string>} visited - 已访问的文件
 * @returns {Promise<void>}
 */
async function findDependenciesRecursive(filePath, language, rootDir, relatedFiles, visited) {
  if (visited.has(filePath)) return;
  visited.add(filePath);
  
  try {
    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf8');
    
    // 提取导入路径
    const importPaths = extractImportPaths(content, language, filePath);
    
    // 查找文件
    for (const importPath of importPaths) {
      const files = await findFilesInProject(importPath);
      
      for (const file of files) {
        if (!visited.has(file)) {
          relatedFiles.add(file);
          
          // 递归查找依赖，但限制深度
          if (visited.size < 20) { // 限制递归深度
            // 确定文件语言类型
            const fileExt = path.extname(file).toLowerCase();
            let fileLanguage = language;
            
            // 根据扩展名调整语言
            if (fileExt === '.py') fileLanguage = 'python';
            else if (fileExt === '.java') fileLanguage = 'java';
            else if (['.c', '.h'].includes(fileExt)) fileLanguage = 'c';
            else if (['.cpp', '.hpp', '.cc'].includes(fileExt)) fileLanguage = 'cpp';
            else if (['.js', '.ts'].includes(fileExt)) fileLanguage = 'javascript';
            
            await findDependenciesRecursive(file, fileLanguage, rootDir, relatedFiles, visited);
          }
        }
      }
    }
  } catch (error) {
    console.error(`查找依赖失败: ${filePath}`, error);
  }
}

/**
 * 获取所有代码文件路径
 * @param {string} rootDir 仓库根目录
 * @returns {Promise<string[]>}
 */
function getAllCodeFiles(rootDir) {
  // 支持的代码后缀
  const exts = ["js", "ts", "py", "java", "cpp", "c", "h", "hpp"];
  const pattern = `**/*.+(${exts.join("|")})`;
  return new Promise((resolve, reject) => {
    glob(
      pattern,
      { cwd: rootDir, absolute: true, ignore: "**/node_modules/**" },
      (err, files) => {
        if (err) reject(err);
        else resolve(files);
      }
    );
  });
}

/**
 * 按N行拆分
 * @param {string} content 文件内容
 * @param {number} chunkSize 每片行数
 * @returns {Array<{start: number, end: number, text: string}>}
 */
function splitByLines(content, chunkSize = 50) {
  const lines = content.split("\n");
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize).join("\n");
    chunks.push({
      start: i + 1,
      end: Math.min(i + chunkSize, lines.length),
      text: chunk,
    });
  }
  return chunks;
}

/**
 * 根据文件扩展名获取对应的语言解析器
 * @param {string} filePath 
 * @returns {any} 语言解析器或null
 */
function getLanguageParser(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return LANG_MAP[ext] || null;
}

/**
 * 使用tree-sitter按函数/类/方法拆分代码
 * @param {string} content 文件内容
 * @param {string} filePath 文件路径
 * @returns {Array<{start, end, text}>}
 */
function splitByTreeSitter(content, filePath) {
  const Language = getLanguageParser(filePath);
  if (!Language) {
    // 不支持的文件类型，回退到按行分块
    return splitByLines(content, 50);
  }

  try {
    const parser = new Parser();
    parser.setLanguage(Language);
    const tree = parser.parse(content);
    const chunks = [];
    
    // 收集代码中的函数/类/方法定义
    collectStructureNodes(tree.rootNode, content, chunks);
    
    // 如果没有找到任何结构，回退到按行分块
    if (chunks.length === 0) {
      return splitByLines(content, 50);
    }
    
    // 填补结构之间的空隙代码（如全局变量、导入语句等）
    const filledChunks = fillGaps(chunks, content);
    return filledChunks;
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error);
    // 解析出错，回退到按行分块
    return splitByLines(content, 50);
  }
}

/**
 * 收集代码结构节点（函数/类/方法等）
 * @param {any} node tree-sitter节点
 * @param {string} content 文件内容
 * @param {Array} chunks 收集的代码块
 */
function collectStructureNodes(node, content, chunks) {
  // 不同语言的结构节点类型
  const structureTypes = [
    'function_definition', 'function_declaration', 'method_definition',
    'class_declaration', 'class_definition',
    'function', 'method', 'class',
    'arrow_function', 'constructor_definition'
  ];
  
  if (structureTypes.includes(node.type)) {
    // 计算行号（从1开始）
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    
    chunks.push({
      type: node.type,
      start: startLine,
      end: endLine,
      text: content.substring(node.startIndex, node.endIndex)
    });
  }
  
  // 递归遍历子节点
  for (const child of node.children) {
    collectStructureNodes(child, content, chunks);
  }
}

/**
 * 填补代码结构之间的空隙
 * @param {Array} chunks 代码结构块
 * @param {string} content 完整文件内容
 * @returns {Array} 完整的代码块
 */
function fillGaps(chunks, content) {
  // 按开始行排序
  chunks.sort((a, b) => a.start - b.start);
  
  const lines = content.split('\n');
  const result = [];
  let currentLine = 1;
  
  for (const chunk of chunks) {
    // 处理结构前的代码
    if (chunk.start > currentLine) {
      const gapText = lines.slice(currentLine - 1, chunk.start - 1).join('\n');
      if (gapText.trim()) {
        result.push({
          type: 'gap',
          start: currentLine,
          end: chunk.start - 1,
          text: gapText
        });
      }
    }
    
    // 添加结构块
    result.push(chunk);
    currentLine = chunk.end + 1;
  }
  
  // 处理最后一个结构后的代码
  if (currentLine <= lines.length) {
    const gapText = lines.slice(currentLine - 1).join('\n');
    if (gapText.trim()) {
      result.push({
        type: 'gap',
        start: currentLine,
        end: lines.length,
        text: gapText
      });
    }
  }
  
  return result;
}

/**
 * 按行拆分（回退方案）
 * @param {string} content 
 * @param {number} chunkSize 
 * @returns {Array<{start, end, text}>}
 */
function splitByLines(content, chunkSize = 50) {
  const lines = content.split("\n");
  const chunks = [];
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize).join("\n");
    chunks.push({
      start: i + 1,
      end: Math.min(i + chunkSize, lines.length),
      text: chunk,
    });
  }
  return chunks;
}

let hnswStore = null;

/**
 * 初始化或加载本地 HNSWLib 向量数据库
 * @param {string} rootDir - 仓库根目录 / Repository root directory
 * @returns {Promise<HNSWLib>} - HNSWLib 实例 / HNSWLib instance
 */

//调用gpt4自带的embedding模型(由于gpt4api的问题，该方法暂时不可用)
// async function getHNSWStore(rootDir) {
//   const dbPath = path.join(rootDir, ".navicode_hnsw");
//   if (hnswStore) return hnswStore;

//   if (fs.existsSync(dbPath)) {
//     // 如果数据库文件已存在，则加载
//     // Load existing database if exists
//     hnswStore = await HNSWLib.load(
//       dbPath,
//       new OpenAIEmbeddings({ openAIApiKey: process.env.gpt4 })
//     );
//   } else {
//     // 否则新建一个数据库
//     // Otherwise, create a new one
//     hnswStore = new HNSWLib(
//       new OpenAIEmbeddings({ openAIApiKey: process.env.gpt4 }),
//       { space: "cosine" }
//     );
//   }
//   return hnswStore;
// }

//调用本地下载的embedding模型
async function getHNSWStore(rootDir) {
  const dbPath = path.join(rootDir, ".navicode_hnsw");
  if (hnswStore) return hnswStore;

  if (fs.existsSync(dbPath)) {
    hnswStore = await HNSWLib.load(
      dbPath,
      new LocalEmbeddings()
    );
  } else {
    hnswStore = new HNSWLib(
      new LocalEmbeddings(),
      { space: "cosine" }
    );
  }
  return hnswStore;
}

/**
 * 插入所有代码片段到本地 HNSWLib 数据库，并保存到磁盘
 * @param {Array<{id, file, start, end, text}>} chunks - 代码片段数组
 * @param {string} rootDir - 仓库根目录
 */
async function insertChunksToHNSW(chunks, rootDir) {
  const store = await getHNSWStore(rootDir);
  const docs = chunks.map((chunk) => ({
    pageContent: chunk.text,
    metadata: {
      file: chunk.file,
      start: chunk.start,
      end: chunk.end,
      id: chunk.id,
    },
  }));
  await store.addDocuments(docs);
  // 保存数据库到本地
  const dbPath = path.join(rootDir, ".navicode_hnsw");
  await store.save(dbPath);
}

/**
 * 查询本地 HNSWLib 数据库，返回最相关的代码片段及相似度分数
 * Query the local HNSWLib database for the most similar code chunks to the input text.
 * @param {string} queryText - 查询文本
 * @param {number} topN - 返回前 N 个结果
 * @param {string} rootDir - 仓库根目录
 * @returns {Promise<Array<{file, start, end, text, score}>>}
 */
async function queryRagSnippetsHNSW(queryText, topN, rootDir) {
  const store = await getHNSWStore(rootDir);
  const results = await store.similaritySearchWithScore(queryText, topN);
  return results.map(([doc, score]) => ({
    file: doc.metadata.file,
    start: doc.metadata.start,
    end: doc.metadata.end,
    text: doc.pageContent,
    score,
  }));
}

// 获取用户自定义提示词，应用模板变量
function getCustomPrompt(document) {
  const promptTemplate = vscode.workspace
    .getConfiguration("navicode")
    .get("customPrompt", "无");

  if (!promptTemplate) return "无";

  return promptTemplate;
}

/**
 * 获取仓库根目录（存在 .git 的目录）
 */
function findGitRoot(startPath) {
  let dir = startPath;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

/**
 * 检查是否启用 README 功能
 */
function isReadmeEnabled() {
  return vscode.workspace
    .getConfiguration("navicode")
    .get("enableReadme", true);
}

/**
 * 读取根目录 README
 * @returns {{ content: string, truncated: boolean }}
 */
function getReadmeContent() {
  if (!isReadmeEnabled()) return { content: "", truncated: false };

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return { content: "", truncated: false };

  const root = findGitRoot(workspaceFolders[0].uri.fsPath);
  if (!root) return { content: "", truncated: false };

  const candidates = ["README.md", "README.markdown", "README.txt", "README"];
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      let data = fs.readFileSync(p, "utf8");
      const maxSize = vscode.workspace
        .getConfiguration("navicode")
        .get("maxReadmeSize", 20000);
      let truncated = false;
      if (data.length > maxSize) {
        data = data.slice(0, maxSize) + "\n\n...（已截断）";
        truncated = true;
      }
      return { content: data, truncated };
    }
  }

  return { content: "", truncated: false };
}

/**
 * 检查是否启用 git diff 功能
 */
function isGitDiffEnabled() {
  return vscode.workspace
    .getConfiguration("navicode")
    .get("enableGitDiff", true);
}

/**
 * 读取当前文件与 HEAD（最新提交）之间的 diff（还未测试）
 * @param {vscode.TextDocument} document
 * @returns {{ diff: string, truncated: boolean }}
 */
function getCurrentFileDiff(document) {
  if (!isGitDiffEnabled()) return { diff: "", truncated: false };

  const maxChars = vscode.workspace
    .getConfiguration("navicode")
    .get("maxDiffSize", 50000);
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return { diff: "", truncated: false };

  const gitRoot = findGitRoot(workspaceFolders[0].uri.fsPath);
  if (!gitRoot) return { diff: "", truncated: false };

  // 相对于仓库根的文件路径
  const relPath = path
    .relative(gitRoot, document.uri.fsPath)
    .replace(/\\/g, "/");
  let raw;
  try {
    // HEAD 表示最新一次提交；如果有未提交改动，git diff 会把它们包含进来
    raw = execSync(`git diff HEAD -- ${relPath}`, {
      cwd: gitRoot,
      encoding: "utf8",
    });
  } catch (e) {
    // 可能没任何改动或命令失败
    raw = "";
  }

  let truncated = false;
  if (raw.length > maxChars) {
    raw = raw.slice(0, maxChars) + "\n...（已截断）";
    truncated = true;
  }
  return { diff: raw, truncated };
}

/**
 * 获取自动触发开关状态
 * @returns {boolean} - 是否启用自动触发
 */
function isAutoTriggerEnabled() {
  return vscode.workspace
    .getConfiguration("navicode")
    .get("enableAutoTrigger", true);
}

/**
 * 检查是否启用关联文件功能
 */
function isRelatedFilesEnabled() {
  return vscode.workspace
    .getConfiguration("navicode")
    .get("enableRelatedFiles", false);
}

/**
 * 检查是否启用纯净模式
 */
function isPurittyEnabled() {
  return vscode.workspace
    .getConfiguration("navicode")
    .get("enablePurity", false);
}

/**
 * 检查是否启用Rag
 */
function isRagEnabled() {
  return vscode.workspace.getConfiguration("navicode").get("enableRag", false);
}

/**
 * 提取文件中的导入语句并解析出文件路径
 * @param {string} content - 文件内容
 * @param {string} language - 语言类型
 * @param {string} currentFilePath - 当前文件路径
 * @returns {string[]} - 关联文件路径数组
 */
function extractImportPaths(content, language, currentFilePath) {
  const importPaths = [];
  const currentDir = path.dirname(currentFilePath);

  // 不同语言的导入语句正则
  const patterns = {
    javascript: [
      /import\s+.*\s+from\s+['"](\.\/|\.\.\/|\/)[^'"]+['"]/g, // ES6 import
      /require\(\s*['"](\.\/|\.\.\/|\/)[^'"]+['"]\s*\)/g, // CommonJS require
    ],
    typescript: [
      /import\s+.*\s+from\s+['"](\.\/|\.\.\/|\/)[^'"]+['"]/g,
      /import\s*\(\s*['"](\.\/|\.\.\/|\/)[^'"]+['"]\s*\)/g,
    ],
    python: [
      /from\s+(\.+\w+|\w+)(\.\w+)*\s+import/g,
      /import\s+(\w+)(\.\w+)*/g,
    ],
    java: [/import\s+([a-zA-Z0-9_$.]+\*?);/g],
    c: [/#include\s+["<](\.\/|\.\.\/)?([^">]+)[">]/g],
    cpp: [/#include\s+["<](\.\/|\.\.\/)?([^">]+)[">]/g],
  };

  // 获取适用于当前语言的模式
  const languagePatterns = patterns[language] || [];

  // 遍历所有模式进行匹配
  for (const pattern of languagePatterns) {
    const matches = content.match(pattern) || [];

    for (const match of matches) {
      let importPath = "";

      // 根据不同语言提取导入路径
      if (language === "javascript" || language === "typescript") {
        // 提取 'from "path"' 或 'require("path")' 中的路径
        const pathMatch = match.match(/['"]([^'"]+)['"]/);
        if (pathMatch && pathMatch[1].startsWith(".")) {
          importPath = path.resolve(currentDir, pathMatch[1]);
        }
      } else if (language === "python") {
        // 处理 from ... import ... 或 import ...
        let modulePath = "";
        if (match.startsWith("from")) {
          const fromMatch = match.match(/from\s+([^\s]+)/);
          if (fromMatch) modulePath = fromMatch[1];
        } else {
          const importMatch = match.match(/import\s+([^\s]+)/);
          if (importMatch) modulePath = importMatch[1];
        }

        // 处理相对导入
        if (modulePath.startsWith(".")) {
          importPath = path.resolve(
            currentDir,
            modulePath.replace(/\./g, "/") + ".py"
          );
        }
      } else if (language === "java") {
        // Java 导入处理
        const packageMatch = match.match(/import\s+([^;]+);/);
        if (packageMatch) {
          const packagePath = packageMatch[1].replace(/\./g, "/");
          // 搜索项目中的Java文件
          importPath = packagePath + ".java";
        }
      } else if (language === "c" || language === "cpp") {
        // 处理 #include "file.h" 或 #include <file.h>
        const includeMatch = match.match(/["<]([^">]+)[">]/);
        if (includeMatch) {
          const includePath = includeMatch[1];
          if (includePath.startsWith("./") || includePath.startsWith("../")) {
            importPath = path.resolve(currentDir, includePath);
          } else {
            // 本地头文件，尝试在当前目录和项目中查找
            importPath = includePath;
          }
        }
      }

      if (importPath && !importPaths.includes(importPath)) {
        importPaths.push(importPath);
      }
    }
  }

  return importPaths;
}

/**
 * 在项目中查找文件
 * @param {string} filePath - 文件路径或模式
 * @returns {Promise<string[]>} - 找到的文件路径
 */
async function findFilesInProject(filePath) {
  // 如果是绝对路径，直接检查文件是否存在
  if (path.isAbsolute(filePath)) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return [filePath];
    } catch (error) {
      console.log("\n文件不存在：", filePath);
      // 文件不存在
      return [];
    }
  }

  // 对于相对路径或模块名，使用glob模式搜索
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];

  // 构建搜索模式
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath) || ".*";
  const searchPattern =
    fileName === filePath
      ? `**/${fileName}${fileExt === ".*" ? fileExt : ""}`
      : `**/${filePath}`;

  try {
    const files = await vscode.workspace.findFiles(
      searchPattern,
      "**/node_modules/**"
    );
    return files.map((file) => file.fsPath);
  } catch (error) {
    console.error("搜索项目文件失败:", error);
    return [];
  }
}

/**
 * 读取文件内容
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} - 文件内容
 */
async function readFileContent(filePath) {
  try {
    const content = await vscode.workspace.fs.readFile(
      vscode.Uri.file(filePath)
    );
    return Buffer.from(content).toString("utf8");
  } catch (error) {
    console.error(`读取文件失败 ${filePath}:`, error);
    return "";
  }
}

/**
 * 获取关联文件的内容
 * @param {vscode.TextDocument} document - 当前文档
 * @returns {Promise<Object>} - 包含关联文件内容的对象
 */
async function getRelatedFilesContent(document) {
  if (!isRelatedFilesEnabled()) return { files: [] };

  const maxFileSize = vscode.workspace
    .getConfiguration("navicode")
    .get("maxRelatedFileSize", 50000);
  const maxTotalSize = vscode.workspace
    .getConfiguration("navicode")
    .get("maxTotalRelatedFilesSize", 50000);

  const content = document.getText();
  const language = document.languageId;
  const filePath = document.fileName;

  // 提取导入路径
  const importPaths = extractImportPaths(content, language, filePath);

  // 查找文件
  const relatedFiles = [];
  let totalSize = 0;
  const processedPaths = new Set(); // 防止循环引用

  for (const importPath of importPaths) {
    console.log("\n找到的文件路径：", importPath);

    if (processedPaths.has(importPath)) continue;
    processedPaths.add(importPath);

    const files = await findFilesInProject(importPath);

    for (const file of files) {
      if (file === filePath) continue; // 跳过自引用

      let fileContent = await readFileContent(file);

      // 检查文件大小
      if (fileContent.length > maxFileSize) {
        fileContent =
          fileContent.substring(0, maxFileSize) +
          `\n// ... 文件过大，已截断 (文件长度：${fileContent.length} > 文件可读取最大长度：${maxFileSize} 字符)`;
      }

      // 检查总大小限制
      if (totalSize + fileContent.length > maxTotalSize) {
        if (relatedFiles.length === 0) {
          // 至少包含一个文件
          relatedFiles.push({
            path: file,
            content:
              fileContent.substring(0, maxTotalSize) +
              `\n// ... 超出总大小限制 (${maxTotalSize} 字符)`,
          });
        }
        return {
          files: relatedFiles,
          truncated: true,
          message: `相关文件总大小超过限制 (${maxTotalSize} 字符)，因此只截取部分内容`,
        };
      }

      relatedFiles.push({
        path: file,
        content: fileContent,
      });

      totalSize += fileContent.length;
    }
  }

  return { files: relatedFiles };
}

/**
 * 插件激活函数
 */
function activateCodeCompletion(context) {
  const languages = ["javascript", "python", "java", "c", "cpp"];

  // 注册配置变更事件
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("navicode.enableAutoTrigger")) {
        // 配置已更改，可以在这里添加额外的处理逻辑
        console.log("自动触发设置已更改为:", isAutoTriggerEnabled());
      }
    })
  );

  // 注册快捷键命令来触发建议生成 (Alt+Ctrl+.)
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.generateSuggestion", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !languages.includes(editor.document.languageId)) return;

      // 显示加载提示
      showLoadingIndicator(editor);

      try {
        // 标记为手动触发
        isManuallyTriggered = true;

        // 触发内联补全
        await vscode.commands.executeCommand(
          "editor.action.inlineSuggest.trigger"
        );
      } finally {
        // 重置标记
        setTimeout(() => {
          isManuallyTriggered = false;
        }, 500);

        // 无论成功与否，都隐藏加载提示
        hideLoadingIndicator();
      }
    })
  );

  // 注册内联补全提供程序
  //vscode提供的这个方法好像内嵌一个防抖的机制，只有在用户输入完成一段时间后才会生成内联代码
  //不过不清楚具体的延迟是多少
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      languages.map((lang) => ({ language: lang })), // 仅支持指定的语言
      {
        provideInlineCompletionItems: async (
          document,
          position,
          context,
          token
        ) => {
          // 检查是否应该提供补全
          const autoTriggerEnabled = isAutoTriggerEnabled();

          // 如果自动触发被禁用且不是手动触发，则不提供补全
          if (!autoTriggerEnabled && !isManuallyTriggered) {
            return null;
          }

          if (isManuallyTriggered) {
            // 显示加载提示
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document === document) {
              showLoadingIndicator(editor);
            }
          }

          try {
            // 获取建议
            const suggestion = await getSuggestion(document, position);
            if (!suggestion) return null;

            // 创建内联补全项
            const item = new vscode.InlineCompletionItem(suggestion);
            item.range = new vscode.Range(position, position);

            return [item];
          } finally {
            // 隐藏加载提示
            hideLoadingIndicator();
          }
        },
      }
    )
  );

  // 注册命令来切换自动触发功能
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.toggleAutoTrigger", async () => {
      const currentValue = isAutoTriggerEnabled();
      await vscode.workspace
        .getConfiguration("navicode")
        .update("enableAutoTrigger", !currentValue, true);
      vscode.window.showInformationMessage(
        `代码自动补全已${!currentValue ? "启用" : "禁用"}`
      );
    })
  );

  // 注册命令来切换读取README功能
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.toggleReadme", async () => {
      const currentValue = isReadmeEnabled();
      await vscode.workspace
        .getConfiguration("navicode")
        .update("enableReadme", !currentValue, true);
      vscode.window.showInformationMessage(
        `README读取功能${!currentValue ? "启用" : "禁用"}`
      );
    })
  );

  // 监听编辑器关闭事件，确保清理装饰器
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => {
      hideLoadingIndicator();
    })
  );

  // 注册Git Diff功能的开关命令
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.toggleGitDiff", async () => {
      const currentValue = isGitDiffEnabled();
      await vscode.workspace
        .getConfiguration("navicode")
        .update("enableGitDiff", !currentValue, true);
      vscode.window.showInformationMessage(
        `Git查询变更历史功能已${!currentValue ? "启用" : "禁用"}`
      );
    })
  );

  // 注册关联文件功能的开关命令
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.toggleRelatedFiles", async () => {
      const currentValue = isRelatedFilesEnabled();
      await vscode.workspace
        .getConfiguration("navicode")
        .update("enableRelatedFiles", !currentValue, true);
      vscode.window.showInformationMessage(
        `关联文件功能已${!currentValue ? "启用" : "禁用"}`
      );
    })
  );

  // 注册纯净模式的开关命令
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.togglePurity", async () => {
      const currentValue = isPurittyEnabled();
      await vscode.workspace
        .getConfiguration("navicode")
        .update("enablePurity", !currentValue, true);
      vscode.window.showInformationMessage(
        `纯净模式已${!currentValue ? "启用" : "禁用"}`
      );
    })
  );

  // 注册Rag的开关命令
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.toggleRag", async () => {
      const currentValue = isRagEnabled();
      await vscode.workspace
        .getConfiguration("navicode")
        .update("enableRag", !currentValue, true);
      vscode.window.showInformationMessage(
        `Rag查询已${!currentValue ? "启用" : "禁用"}`
      );
    })
  );

  // 注册编辑提示词命令
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.editCustomPrompt", async () => {
      const config = vscode.workspace.getConfiguration("navicode");
      const currentPrompt = config.get("customPrompt", "");

      const newPrompt = await vscode.window.showInputBox({
        value: currentPrompt,
        prompt: "编辑代码补全提示词",
        placeHolder:
          "例如：请提供高质量的{{language}}代码补全，保持代码风格一致",
        validateInput: (text) => {
          if (text.length > 500) {
            return "提示词过长，请保持在500字符以内";
          }
          return null;
        },
      });

      if (newPrompt !== undefined) {
        // 用户没有取消
        await config.update("customPrompt", newPrompt, true);
        console.log("用户自定义提示词：", newPrompt);
        vscode.window.showInformationMessage("代码补全提示词已更新");
      }
    })
  );

  //用户打开自定义模板的功能注册
  // 1. 定义所有内置模板，并读取它们的原始内容
  const config = vscode.workspace.getConfiguration("navicode");
  // inspect 拿到 package.json 里定义的默认模板数组
  const templatesInspect = config.inspect("templates");
  const defaultTemplates = Array.isArray(templatesInspect.defaultValue)
    ? templatesInspect.defaultValue
    : [];

  // 把每条都标记为内置
  const builtInTemplates = defaultTemplates.map((t) => ({
    ...t,
    isBuiltIn: true,
  }));

  // 读用户自己加的（filter 掉与内置同 id 的）
  let userTemplates = config.get("templates", []);
  let activeId = config.get("activeTemplate", builtInTemplates[0].id);

  // 合并
  let templates = mergeTemplates(builtInTemplates, userTemplates);

  // 4. 注册命令和 Webview
  context.subscriptions.push(
    vscode.commands.registerCommand("navicode.configureTemplate", async () => {
      const panel = vscode.window.createWebviewPanel(
        "navicodeTemplateConfig",
        "Prompt 模板配置",
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      // 加载 HTML
      const htmlPath = path.join(
        context.extensionPath,
        "media",
        "promptConfig.html"
      );
      let html = fs
        .readFileSync(htmlPath, "utf8")
        .replace(
          /%BASE_URI%/g,
          panel.webview
            .asWebviewUri(
              vscode.Uri.file(path.join(context.extensionPath, "media"))
            )
            .toString()
        );
      panel.webview.html = html;

      // 首次 init
      panel.webview.postMessage({ command: "init", templates, activeId });

      // 处理来自 Webview 的消息
      panel.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case "save":
            // 1. 在 userTemplates 里替换或新增这条 id
            userTemplates = userTemplates.filter((t) => t.id !== message.id);
            userTemplates.push({
              id: message.id,
              name: message.name,
              template: message.template,
            });

            // 2. 写回 settings.json
            await config.update("templates", userTemplates, true);

            // 3. 重新合并并通知 Webview 刷新
            templates = mergeTemplates(builtInTemplates, userTemplates);
            panel.webview.postMessage({ command: "init", templates, activeId });

            vscode.window.showInformationMessage(
              `模板「${message.name}」已保存`
            );
            break;

          case "reset":
            if (builtInTemplates.some((t) => t.id === message.id)) {
              // 删除掉对应的覆盖记录，merge 时就回退到内置原版
              userTemplates = userTemplates.filter((t) => t.id !== message.id);
              vscode.window.showInformationMessage(
                `已重置「${message.name}」到内置默认`
              );
            } else {
              // 自定义模板：直接清空内容或做你想要的 fallback
              userTemplates = userTemplates.map((t) =>
                t.id === message.id ? { ...t, template: "" } : t
              );
              vscode.window.showInformationMessage(
                `已重置自定义模板「${message.name}」`
              );
            }
            await config.update("templates", userTemplates, true);

            templates = mergeTemplates(builtInTemplates, userTemplates);
            panel.webview.postMessage({ command: "init", templates, activeId });
            break;

          case "add":
            // 新增一定属于用户模板
            const newId = `tpl_${Date.now()}`;
            const newTpl = {
              id: newId,
              name: message.name || `新模板-${userTemplates.length + 1}`,
              template: message.template || "",
              isBuiltIn: false,
            };
            templates.push(newTpl);
            userTemplates.push({
              id: newId,
              name: newTpl.name,
              template: newTpl.template,
            });
            await config.update("templates", userTemplates, true);
            activeId = newId;
            await config.update("activeTemplate", activeId, true);
            panel.webview.postMessage({ command: "init", templates, activeId });
            vscode.window.showInformationMessage(
              `已创建新模板「${newTpl.name}」`
            );
            break;

          case "delete":
            // 内置模板禁止删除
            if (builtInTemplates.some((t) => t.id === message.id)) {
              vscode.window.showWarningMessage("系统内置模板无法删除");
              return;
            }
            templates = templates.filter((t) => t.id !== message.id);
            userTemplates = userTemplates.filter((t) => t.id !== message.id);
            await config.update("templates", userTemplates, true);
            if (activeId === message.id) {
              activeId = builtInTemplates[0].id;
              await config.update("activeTemplate", activeId, true);
            }
            panel.webview.postMessage({ command: "init", templates, activeId });
            vscode.window.showInformationMessage(
              `已删除模板「${message.name}」`
            );
            break;

          case "switch":
            activeId = message.id;
            await config.update("activeTemplate", activeId, true);
            panel.webview.postMessage({ command: "init", templates, activeId });
            break;
        }
      });
    })
  );
}
/**
 * 将 builtInTemplates 和 userTemplates 合并成“最终展示”的 templates 数组
 */
function mergeTemplates(builtInTemplates, userTemplates) {
  // 先把内置模板一条条合并（有覆盖就用覆盖内容）
  const mergedBuiltIns = builtInTemplates.map((bt) => {
    const override = userTemplates.find((ut) => ut.id === bt.id);
    if (override) {
      // 保留 isBuiltIn 标志，更新 template
      return { ...bt, template: override.template };
    }
    return bt;
  });

  // 再把 id 不在内置里的用户模板当成“纯自定义”附加
  const custom = userTemplates
    .filter((ut) => !builtInTemplates.some((bt) => bt.id === ut.id))
    .map((ut) => ({ ...ut, isBuiltIn: false }));

  return [...mergedBuiltIns, ...custom];
}
/**
 * 插件关闭清理
 */
function deactivateCodeCompletion() {
  hideLoadingIndicator();
}

module.exports = {
  activateCodeCompletion,
  deactivateCodeCompletion,
};
