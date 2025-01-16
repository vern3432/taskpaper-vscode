"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const previewPanel_1 = require("./previewPanel");
function activate(context) {
    console.log('TaskPaper extension is now active');
    let toggleDone = vscode.commands.registerCommand('taskpaper.toggleDone', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const document = editor.document;
        if (document.languageId !== 'taskpaper') {
            return;
        }
        editor.edit(editBuilder => {
            const line = document.lineAt(editor.selection.active.line);
            const lineText = line.text;
            if (lineText.includes('@done')) {
                // Remove @done tag
                const newText = lineText.replace(/@done(\([^)]*\))?/, '').trim();
                editBuilder.replace(line.range, newText);
            }
            else {
                // Add @done tag with timestamp
                const date = new Date().toLocaleString();
                const newText = `${lineText.trim()} @done(${date})`;
                editBuilder.replace(line.range, newText);
            }
        });
    });
    // Register preview command
    let openPreview = vscode.commands.registerCommand('taskpaper.openPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'taskpaper') {
            previewPanel_1.TaskPaperPreviewPanel.createOrShow(context.extensionUri, editor.document);
        }
    });
    // Register decorations for @done items
    const doneDecorationType = vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through',
        color: 'gray'
    });
    function updateDecorations() {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'taskpaper') {
            return;
        }
        const document = editor.document;
        const decorationsArray = [];
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);
            if (line.text.includes('@done')) {
                const decoration = { range: line.range };
                decorationsArray.push(decoration);
            }
        }
        editor.setDecorations(doneDecorationType, decorationsArray);
    }
    // Update decorations when the active editor changes
    vscode.window.onDidChangeActiveTextEditor(() => {
        updateDecorations();
    }, null, context.subscriptions);
    // Update decorations when the document changes
    vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document === vscode.window.activeTextEditor?.document) {
            updateDecorations();
        }
    }, null, context.subscriptions);
    // Initial update of decorations
    updateDecorations();
    context.subscriptions.push(toggleDone, openPreview);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map