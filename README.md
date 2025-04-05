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
