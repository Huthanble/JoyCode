const vscode = require('vscode');
const { openai } = require('./openaiClient'); 

function activateAiChatCodeGen(){
    const panel = vscode.window.createWebviewPanel(
        'chatPanel',
        'AI Chat',
        vscode.ViewColumn.Beside,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        }
    );
    
    panel.webview.html = getWebviewContent();
}

function getWebviewContent(){
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Chat</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 10px; }
        #chatbox { width: 100%; height: 400px; border: 1px solid #ccc; padding: 10px; overflow-y: auto; }
        input { width: 90%; padding: 5px; }
        button { padding: 5px 10px; }
      </style>
    </head>
    <body>
      <div id="chatbox"></div>
      <input id="message" type="text" placeholder="Type a message..." />
      <button onclick="sendMessage()">Send</button>

      <script>
        const vscode = acquireVsCodeApi();
        function sendMessage() {
          const input = document.getElementById("message");
          const chatbox = document.getElementById("chatbox");
          if (input.value.trim() !== "") {
            chatbox.innerHTML += "<p><strong>You:</strong> " + input.value + "</p>";
            input.value = "";
          }
        }
      </script>
    </body>
    </html>
  `;
}
function deactivateAiChatCodeGen(){

}
module.exports = { 
    activateAiChatCodeGen,
    deactivateAiChatCodeGen
 };