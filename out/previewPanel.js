"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskPaperPreviewPanel = void 0;
const vscode = require("vscode");
class TaskPaperPreviewPanel {
    constructor(panel, extensionUri, document) {
        this._disposables = [];
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._document = document;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'toggleTask':
                    await this._toggleTask(message.line);
                    break;
                case 'updateTask':
                    await this._updateTask(message.line, message.text);
                    break;
                case 'addTask':
                    await this._addTask(message.line);
                    break;
                case 'addProject':
                    await this._addProject(message.line);
                    break;
                case 'deleteProject':
                    await this._deleteProject(message.line);
                    break;
            }
        }, null, this._disposables);
        vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document === this._document) {
                this._update();
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionUri, document) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (TaskPaperPreviewPanel.currentPanel) {
            TaskPaperPreviewPanel.currentPanel._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('taskpaperPreview', 'TaskPaper Preview', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });
        TaskPaperPreviewPanel.currentPanel = new TaskPaperPreviewPanel(panel, extensionUri, document);
    }
    async _toggleTask(line) {
        const lineText = this._document.lineAt(line).text;
        // Only toggle lines that are actual tasks (start with -)
        if (!lineText.trim().startsWith('-')) {
            console.log('Not a task line:', lineText);
            return;
        }
        const wsEdit = new vscode.WorkspaceEdit();
        const uri = this._document.uri;
        if (lineText.includes('@done')) {
            const newText = lineText.replace(/@done(\([^)]*\))?/, '').trim();
            wsEdit.replace(uri, this._document.lineAt(line).range, newText);
        }
        else {
            const date = new Date().toLocaleString();
            const newText = `${lineText.trim()} @done(${date})`;
            wsEdit.replace(uri, this._document.lineAt(line).range, newText);
        }
        await vscode.workspace.applyEdit(wsEdit);
    }
    async _updateTask(line, newText) {
        const wsEdit = new vscode.WorkspaceEdit();
        wsEdit.replace(this._document.uri, this._document.lineAt(line).range, newText);
        await vscode.workspace.applyEdit(wsEdit);
    }
    async _addProject(afterLine) {
        const projectName = await vscode.window.showInputBox({
            prompt: 'Enter project name (optionally add @due(MM/DD) for due date)',
            placeHolder: 'Project Name @due(MM/DD)'
        });
        if (projectName) {
            const wsEdit = new vscode.WorkspaceEdit();
            const doc = this._document;
            const lines = doc.getText().split('\n');
            const projects = [];
            let currentProject = null;
            // First collect all existing projects
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line)
                    continue;
                if (line.endsWith(':')) {
                    if (currentProject) {
                        projects.push(currentProject);
                    }
                    const dueDateMatch = line.match(/@due\(([^)]+)\)/);
                    currentProject = {
                        title: line,
                        dueDate: dueDateMatch ? this._parseDate(dueDateMatch[1]) : null,
                        content: []
                    };
                }
                else if (currentProject) {
                    currentProject.content.push(lines[i]);
                }
            }
            // Add the last project if it exists
            if (currentProject) {
                projects.push(currentProject);
            }
            // Add the new project
            const newDueDateMatch = projectName.match(/@due\(([^)]+)\)/);
            projects.push({
                title: projectName + ':',
                dueDate: newDueDateMatch ? this._parseDate(newDueDateMatch[1]) : null,
                content: []
            });
            // Sort projects by due date
            projects.sort((a, b) => {
                if (!a.dueDate && !b.dueDate)
                    return 0;
                if (!a.dueDate)
                    return 1;
                if (!b.dueDate)
                    return -1;
                const aTime = a.dueDate.getTime();
                const bTime = b.dueDate.getTime();
                return aTime - bTime;
            });
            // Build the new document content
            const newContent = projects.map(project => {
                return [project.title, ...project.content].join('\n');
            }).join('\n\n');
            // Replace the entire document content
            const fullRange = new vscode.Range(new vscode.Position(0, 0), doc.lineAt(doc.lineCount - 1).range.end);
            wsEdit.replace(doc.uri, fullRange, newContent);
            await vscode.workspace.applyEdit(wsEdit);
        }
    }
    _parseDate(dateStr) {
        // Parse MM/DD format
        const [month, day] = dateStr.split('/').map(n => parseInt(n));
        // Get current date info
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // Convert to 1-based month
        const currentYear = now.getFullYear();
        // Determine if the date should be in the current year or next year
        let year = currentYear;
        if (month < currentMonth) {
            // If the month is earlier than current month, it must be next year
            year = currentYear + 1;
        }
        else if (month === currentMonth && day < now.getDate()) {
            // If it's the same month but day is earlier, it must be next year
            year = currentYear + 1;
        }
        // Create the date
        const date = new Date(year, month - 1, day);
        date.setHours(0, 0, 0, 0);
        return date;
    }
    async _addTask(projectLine) {
        const taskText = await vscode.window.showInputBox({
            prompt: 'Enter task description',
            placeHolder: 'Task description (optionally add @due(MM/DD) for due date)'
        });
        if (taskText) {
            // Find the next project or end of file
            let projectEndLine = projectLine + 1;
            const doc = this._document;
            while (projectEndLine < doc.lineCount && !doc.lineAt(projectEndLine).text.trim().endsWith(':')) {
                projectEndLine++;
            }
            // Parse due date from new task if it exists
            const dueDateMatch = taskText.match(/@due\(([^)]+)\)/);
            const newTaskDueDate = dueDateMatch ? this._parseDate(dueDateMatch[1]) : null;
            // Find the correct insertion point based on due dates
            let insertLine = projectLine + 1;
            let foundPosition = false;
            // Scan through existing tasks to find correct position
            for (let i = projectLine + 1; i < projectEndLine; i++) {
                const lineText = doc.lineAt(i).text.trim();
                if (lineText.startsWith('-')) {
                    const existingDueDateMatch = lineText.match(/@due\(([^)]+)\)/);
                    if (existingDueDateMatch) {
                        const existingDueDate = this._parseDate(existingDueDateMatch[1]);
                        if (newTaskDueDate && (existingDueDate.getFullYear() > newTaskDueDate.getFullYear() ||
                            (existingDueDate.getFullYear() === newTaskDueDate.getFullYear() &&
                                existingDueDate.getMonth() > newTaskDueDate.getMonth()) ||
                            (existingDueDate.getFullYear() === newTaskDueDate.getFullYear() &&
                                existingDueDate.getMonth() === newTaskDueDate.getMonth() &&
                                existingDueDate.getDate() > newTaskDueDate.getDate()))) {
                            insertLine = i;
                            foundPosition = true;
                            break;
                        }
                    }
                    else if (newTaskDueDate) {
                        // If existing task has no due date, put it after tasks with due dates
                        continue;
                    }
                }
            }
            // If we haven't found a position and we have a due date,
            // insert at the beginning of tasks
            if (!foundPosition && newTaskDueDate) {
                insertLine = projectLine + 1;
            }
            // If we don't have a due date, append at the end of tasks with no due dates
            if (!newTaskDueDate) {
                insertLine = projectEndLine;
            }
            const wsEdit = new vscode.WorkspaceEdit();
            const position = new vscode.Position(insertLine, 0);
            wsEdit.insert(this._document.uri, position, `    - ${taskText}\n`);
            await vscode.workspace.applyEdit(wsEdit);
        }
    }
    async _deleteProject(projectLine) {
        const projectName = this._document.lineAt(projectLine).text.replace(':', '');
        const confirm = await vscode.window.showWarningMessage(`Delete project "${projectName}" and all its tasks?`, { modal: true }, 'Delete', 'Cancel');
        if (confirm === 'Delete') {
            const wsEdit = new vscode.WorkspaceEdit();
            // Find the end of the project (next project or end of file)
            let endLine = projectLine + 1;
            const doc = this._document;
            while (endLine < doc.lineCount && !doc.lineAt(endLine).text.trim().endsWith(':')) {
                endLine++;
            }
            // Delete from project line to the line before next project (or EOF)
            const range = new vscode.Range(new vscode.Position(projectLine, 0), new vscode.Position(endLine, 0));
            wsEdit.delete(this._document.uri, range);
            await vscode.workspace.applyEdit(wsEdit);
        }
    }
    _update() {
        this._panel.webview.html = this._getHtmlForWebview();
    }
    _getHtmlForWebview() {
        const text = this._document.getText();
        const tasks = this._parseTaskPaper(text);
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                        padding: 20px;
                        line-height: 1.5;
                        color: var(--vscode-editor-foreground);
                        background: var(--vscode-editor-background);
                    }
                    .project-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-top: 1em;
                        padding: 5px;
                        border-bottom: 1px solid var(--vscode-editorLineNumber-foreground);
                    }
                    .project-title {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }
                    .project { 
                        font-weight: bold;
                        font-size: 1.2em;
                        color: #4B9CD3;
                        background: rgba(75, 156, 211, 0.1);
                        padding: 4px 8px;
                        border-radius: 4px;
                    }
                    .project-actions {
                        display: flex;
                        gap: 4px;
                    }
                    .icon-button {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 24px;
                        height: 24px;
                        border-radius: 4px;
                        border: none;
                        background: transparent;
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                        font-size: 16px;
                        opacity: 0.7;
                        transition: all 0.2s;
                    }
                    .icon-button:hover {
                        opacity: 1;
                        background: var(--vscode-button-hoverBackground);
                    }
                    .delete-button {
                        color: var(--vscode-errorForeground);
                    }
                    .delete-button:hover {
                        background: var(--vscode-errorBackground);
                    }
                    .add-project-container {
                        display: flex;
                        justify-content: center;
                        margin: 20px 0;
                    }
                    .task {
                        margin: 8px 0 8px 20px;
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        padding: 4px;
                        border-radius: 4px;
                        transition: background-color 0.2s;
                    }
                    .task:hover {
                        background: var(--vscode-editor-lineHighlightBackground);
                    }
                    .task.done {
                        color: var(--vscode-disabledForeground);
                        text-decoration: line-through;
                    }
                    .task input[type="checkbox"] {
                        margin: 4px 0 0 0;
                    }
                    .task-text {
                        flex-grow: 1;
                        padding: 2px 4px;
                        border-radius: 3px;
                        line-height: 1.4;
                    }
                    .task-text:hover {
                        background: var(--vscode-editor-selectionBackground);
                        cursor: text;
                    }
                    .tag {
                        display: inline-block;
                        padding: 0 4px;
                        border-radius: 3px;
                        margin: 0 2px;
                    }
                    .tag.class {
                        color: var(--vscode-symbolIcon-classForeground);
                        background: var(--vscode-symbolIcon-classBackground, rgba(0,100,255,0.1));
                    }
                    .tag.due {
                        color: var(--vscode-editorInfo-foreground);
                        background: var(--vscode-editorInfo-background, rgba(0,150,255,0.1));
                    }
                    .tag.done {
                        color: var(--vscode-gitDecoration-addedResourceForeground);
                        background: var(--vscode-gitDecoration-addedResourceBackground, rgba(0,150,0,0.1));
                    }
                    .tag.overdue {
                        color: var(--vscode-errorForeground);
                        background: var(--vscode-errorBackground, rgba(255,0,0,0.1));
                    }
                    .action-button {
                        padding: 2px 8px;
                        border-radius: 3px;
                        border: 1px solid var(--vscode-button-border);
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        cursor: pointer;
                        font-size: 12px;
                    }
                    .action-button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .add-project-button {
                        display: block;
                        margin: 20px auto;
                        padding: 4px 12px;
                    }
                    .status-indicator {
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 16px;
                        border-radius: 50%;
                        margin-right: 4px;
                    }
                    .status-complete {
                        color: #4CAF50;  /* Subtle green */
                    }
                    .status-pending {
                        color: #1E88E5;  /* Dark blue */
                    }
                    .status-overdue {
                        color: #E53935;  /* Vibrant red */
                    }
                </style>
            </head>
            <body>
                <div id="content">
                    ${tasks}
                    <div class="add-project-container">
                        <button class="icon-button add-project-button" data-line="${this._document.lineCount - 1}" title="Add Project">+</button>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    document.addEventListener('click', (e) => {
                        if (e.target.type === 'checkbox') {
                            vscode.postMessage({
                                command: 'toggleTask',
                                line: parseInt(e.target.dataset.line)
                            });
                        } else if (e.target.classList.contains('add-task')) {
                            vscode.postMessage({
                                command: 'addTask',
                                line: parseInt(e.target.dataset.line)
                            });
                        } else if (e.target.classList.contains('add-project-button')) {
                            vscode.postMessage({
                                command: 'addProject',
                                line: parseInt(e.target.dataset.line)
                            });
                        } else if (e.target.classList.contains('delete-project')) {
                            vscode.postMessage({
                                command: 'deleteProject',
                                line: parseInt(e.target.dataset.line)
                            });
                        }
                    });

                    document.addEventListener('dblclick', (e) => {
                        if (e.target.classList.contains('task-text')) {
                            const text = e.target.innerText;
                            const line = parseInt(e.target.dataset.line);
                            const input = document.createElement('input');
                            input.type = 'text';
                            input.value = text;
                            input.style.width = '100%';
                            input.style.padding = '2px 4px';
                            input.style.border = '1px solid var(--vscode-focusBorder)';
                            input.style.borderRadius = '3px';
                            input.style.background = 'var(--vscode-input-background)';
                            input.style.color = 'var(--vscode-input-foreground)';
                            
                            const updateText = () => {
                                if (input.value !== text) {
                                    vscode.postMessage({
                                        command: 'updateTask',
                                        line: line,
                                        text: input.value
                                    });
                                    e.target.innerText = input.value;
                                } else {
                                    e.target.innerText = text;
                                }
                                input.remove();
                            };

                            input.addEventListener('blur', updateText);
                            input.addEventListener('keypress', (ke) => {
                                if (ke.key === 'Enter') {
                                    ke.preventDefault();
                                    updateText();
                                }
                            });
                            input.addEventListener('keydown', (ke) => {
                                if (ke.key === 'Escape') {
                                    ke.preventDefault();
                                    e.target.innerText = text;
                                    input.remove();
                                }
                            });

                            e.target.innerText = '';
                            e.target.appendChild(input);
                            input.focus();
                            input.select();
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
    _parseTaskPaper(text) {
        let html = '';
        const lines = text.split('\n');
        const projects = [];
        let currentProject = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            if (line.endsWith(':')) {
                // If we have a current project, save it
                if (currentProject) {
                    projects.push(currentProject);
                }
                // Start new project
                const dueDateMatch = line.match(/@due\(([^)]+)\)/);
                currentProject = {
                    title: line,
                    dueDate: dueDateMatch ? this._parseDate(dueDateMatch[1]) : null,
                    startLine: i,
                    rawLines: []
                };
            }
            else if (currentProject) {
                currentProject.rawLines.push({
                    text: lines[i],
                    lineNumber: i
                });
            }
        }
        // Add the last project if exists
        if (currentProject) {
            projects.push(currentProject);
        }
        // Sort projects by due date
        projects.sort((a, b) => {
            if (!a.dueDate && !b.dueDate)
                return 0;
            if (!a.dueDate)
                return 1;
            if (!b.dueDate)
                return -1;
            return a.dueDate.getTime() - b.dueDate.getTime();
        });
        // Generate HTML for each project
        for (const project of projects) {
            // Check project status
            let allTasksComplete = true;
            let hasAnyTasks = false;
            let isOverdue = false;
            // Check if project has due date and is overdue
            if (project.dueDate) {
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                isOverdue = project.dueDate < today;
            }
            // Check tasks completion status
            for (const line of project.rawLines) {
                const trimmedLine = line.text.trim();
                if (trimmedLine.startsWith('-')) {
                    hasAnyTasks = true;
                    if (!trimmedLine.includes('@done')) {
                        allTasksComplete = false;
                    }
                }
            }
            // Determine status indicator
            let statusIcon = '';
            if (hasAnyTasks) {
                if (allTasksComplete) {
                    statusIcon = '<div class="status-indicator status-complete">✓</div>';
                }
                else if (isOverdue) {
                    statusIcon = '<div class="status-indicator status-overdue">●</div>';
                }
                else {
                    statusIcon = '<div class="status-indicator status-pending">●</div>';
                }
            }
            html += `
                <div class="project-header">
                    <div class="project-title">
                        ${statusIcon}
                        <div class="project">${this._escapeHtml(project.title)}</div>
                    </div>
                    <div class="project-actions">
                        <button class="icon-button add-task" data-line="${project.startLine}" title="Add Task">+</button>
                        <button class="icon-button delete-button delete-project" data-line="${project.startLine}" title="Delete Project">×</button>
                    </div>
                </div>`;
            // Process tasks within the project
            for (const line of project.rawLines) {
                const trimmedLine = line.text.trim();
                if (trimmedLine.startsWith('-')) {
                    const isDone = trimmedLine.includes('@done');
                    const taskText = trimmedLine.substring(1).trim();
                    html += `
                        <div class="task ${isDone ? 'done' : ''}" data-line="${line.lineNumber}">
                            <input type="checkbox" ${isDone ? 'checked' : ''} data-line="${line.lineNumber}">
                            <span class="task-text" data-line="${line.lineNumber}">${this._formatTask(taskText)}</span>
                        </div>
                    `;
                }
            }
        }
        return html;
    }
    _formatTask(text) {
        let formattedText = this._escapeHtml(text);
        // Format class tags (with or without parentheses)
        formattedText = formattedText.replace(/@class(?:\(([^)]*?)\)|(\s+[^@\s]+(?:\s+[^@\s]+)*))/g, (match, p1, p2) => {
            const value = p1 || p2;
            return `<span class="tag class">@class${value ? `(${value.trim()})` : ''}</span>`;
        });
        // Format due tags and check if overdue
        formattedText = formattedText.replace(/@due(?:\(([^)]*?)\)|(\s+[^@\s]+(?:\s+[^@\s]+)*))/g, (match, p1, p2) => {
            const value = p1 || p2;
            if (!value)
                return match;
            const dueDate = new Date(value);
            const isOverdue = dueDate < new Date() && !text.includes('@done');
            return `<span class="tag ${isOverdue ? 'overdue' : 'due'}">@due(${value.trim()})</span>`;
        });
        // Format done tags
        formattedText = formattedText.replace(/@done(?:\(([^)]*?)\))?/g, (match, p1) => `<span class="tag done">@done${p1 ? `(${p1})` : ''}</span>`);
        // Format other tags
        formattedText = formattedText.replace(/@(\w+)(?:\(([^)]*?)\)|(\s+[^@\s]+(?:\s+[^@\s]+)*))?/g, (match, tag, p1, p2) => {
            if (tag === 'class' || tag === 'due' || tag === 'done')
                return match;
            const value = p1 || p2;
            return `<span class="tag">@${tag}${value ? `(${value.trim()})` : ''}</span>`;
        });
        return formattedText;
    }
    _escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    dispose() {
        TaskPaperPreviewPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
exports.TaskPaperPreviewPanel = TaskPaperPreviewPanel;
//# sourceMappingURL=previewPanel.js.map