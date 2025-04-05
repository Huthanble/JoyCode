# joycode README

This is the README for your extension "joycode". After writing up a brief description, we recommend including the following sections.

## How to use

1.首先安装对应环境
    npm install

2.环境安装完毕过后，按F5进行测试界面，任意创建一个临时界面

3.按住ctrl+shift+P，在上方输入栏输入想要开启的功能
    “打开聊天窗口”————打开ai对话窗口
    “切换自动触发功能”————打开/关闭自动补全，自动关闭后需要通过按ctrl+shift+.以实现自动补全

4.通过鼠标选中一段注释，并右键选择“将注释转换为代码”，即可通过注释生成代码

## Structure

📂 JoyCode
├── 📁 src
│   ├── codeCompletion.js        # 代码补全  
│   ├── aiChatCodeGen.js         # AI 对话生成代码  
│   ├── commentToCode.js         # 根据注释生成代码  
│   ├── openaiClient.js          # OpenAI API 客户端封装  
│   ├── tool.js                 # 工具函数  
├── extension.js                 # 入口文件，加载各个功能模块  
├── package.json  
├── package-lock.json  
└── README.md


## CommentToCode

|——activateCommentToCode(context)   //用于定义启动方式
|   |——generateCodeFromComment()    //用于具体实现将注释转化为代码
|——deactivateCommentToCode()        //用于定义释放资源方式

---

# CodeCompletion模块

## 功能介绍
- 实现了用户编辑文本时在文本内自动补全代码的功能
- 拥有**自动补全**和**手动补全**两种补全方式
- 在**自动补全**的状态下，当用户停止输入文本一段时间后，插件会根据用户编写的上下文自动补全一些代码，以虚影的方式呈现在文本中
- 在**手动补全**的状态下，插件不会自动地输出建议，而是需要用户按下`alt+ctrl+.`的快捷键之后，插件会在光标处显示 `代码生成中...`的提示，然后才会根据上下文进行补全
- 插件会在光标处生成补全建议的虚影，用户可以按下`Tab`键将生成的建议插入文本中
- 按下ctrl+shift+P，在弹出的文本框中输入*Joycode*即可找到切换自动补全与手动补全的开关

## 函数介绍

### 1. showLoadingIndicator(editor)

#### 描述
**描述：** 此函数在给定的编辑器中显示加载提示。提示文字为 `代码生成中...`，采用 *斜体文字* 和灰色字体显示。  
它首先调用 `hideLoadingIndicator()` 清除可能存在的加载提示，然后在当前光标位置设置新的装饰器以展示加载状态。

#### 参数
- **editor**: `vscode.TextEditor`  
  *当前激活的文本编辑器实例。*

#### 主要操作
1. 调用 `hideLoadingIndicator()` 清除之前的加载提示。  
2. 使用 `vscode.window.createTextEditorDecorationType` 创建一个新的装饰类型，设定样式为 **斜体**、灰色文字，并显示 `代码生成中...`。  
3. 获取当前光标位置（`editor.selection.active`）并在该位置设置装饰。

#### 返回值
无返回值


### 2. hideLoadingIndicator()

#### 描述
**描述：** 此函数用于清除并移除所有已设置的加载提示装饰器，从而确保 `代码生成中...` 的提示不再显示。

#### 参数
无参数

#### 主要操作
1. 检查全局变量 `loadingDecorationType` 是否存在。  
2. 遍历 `vscode.window.visibleTextEditors`，对每个编辑器移除该装饰器。  
3. 调用 `loadingDecorationType.dispose()` 方法释放资源，并将 `loadingDecorationType` 设置为 `null`。

#### 返回值
无返回值


### 3. getSuggestion(document, position)

#### 描述
**描述：** 此函数利用 DeepSeek API 根据当前文档内容生成代码补全建议。  
它使用光标前的文本作为 `prompt`，光标后的文本作为 `suffix`，并调用 API 返回生成的建议文本。

#### 参数
- **document**: `vscode.TextDocument`  
  *当前编辑器的文档对象。*
- **position**: `vscode.Position`  
  *当前光标的位置。*

#### 主要操作
1. 获取文档全文，并通过 `document.offsetAt(position)` 得到光标对应的偏移量。  
2. 将光标前的文本作为 `prompt`，光标后的文本作为 `suffix`。  
3. 调用 `openai.completions.create`，传入参数如 `model`、`max_tokens`、`temperature`、`stop` 等，向 DeepSeek API 请求建议。  
4. 解析返回结果，提取建议文本；若发生错误，则在控制台输出错误信息，并返回 `null`。

#### 返回值
返回一个 `Promise`，解析结果为建议文本字符串或 `null`。


### 4. isAutoTriggerEnabled()

#### 描述
**描述：** 此函数从 VSCode 工作区配置中读取 `joycode.enableAutoTrigger` 配置项，判断是否启用了自动触发内联补全功能。

#### 参数
无参数

##### 主要操作
1. 使用 `vscode.workspace.getConfiguration('joycode')` 获取配置。  
2. 读取 `enableAutoTrigger` 的值，默认值为 `true`。

#### 返回值
返回一个 `boolean` 值：  
- `true`：启用自动触发  
- `false`：禁用自动触发


### 5. activateCodeCompletion(context)

#### 描述
**描述：** 此函数为插件的激活函数，用于初始化和注册所有与代码补全相关的功能。  
包括注册配置变更监听、快捷键命令、内联补全提供程序以及切换自动触发功能的命令。

#### 参数
- **context**: `vscode.ExtensionContext`  
  *插件的上下文对象，用于注册命令和事件监听。*

#### 主要操作
1. **配置监听：** 注册监听器以监控 `joycode.enableAutoTrigger` 配置项的变更。  
2. **命令注册：**  
   - 注册 `joycode.generateSuggestion` 命令，通过快捷键（如 `Alt+Ctrl+.`）触发内联补全，并在触发时显示加载提示。  
   - 注册 `joycode.toggleAutoTrigger` 命令，用于切换自动触发功能，并通过通知显示当前状态。  
3. **内联补全提供程序：**  
   - 注册内联补全提供程序，仅针对 `javascript`、`python`、`java`、`c`、`cpp` 等语言。  
   - 根据 `isAutoTriggerEnabled()` 和 `isManuallyTriggered` 状态，决定是否提供建议。  
   - 调用 `getSuggestion(document, position)` 获取建议，并构造 `vscode.InlineCompletionItem` 返回。  
4. **编辑器事件监听：** 监听编辑器可见性变化，以便在编辑器关闭时调用 `hideLoadingIndicator()` 清理加载提示。

#### 返回值
无返回值


### 6. deactivateCodeCompletion()

#### 描述
**描述：** 此函数为插件停用时调用的清理函数。  
主要功能是调用 `hideLoadingIndicator()` 清除所有加载提示，释放相关资源。

#### 参数
无参数

#### 主要操作
1. 调用 `hideLoadingIndicator()` 清除加载提示装饰器。

#### 返回值
无返回值

---

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Working with Markdown

You can author your README using Visual Studio Code.  Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux)
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux)
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**