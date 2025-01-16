# TaskPaper Extension for VS Code

A VS Code extension for working with TaskPaper format files. This extension provides syntax highlighting, task management features, and visual enhancements for TaskPaper files.

## Features

- Syntax highlighting for TaskPaper files (`.taskpaper` extension)
- Toggle tasks as done/undone with `Ctrl+D` (`Cmd+D` on Mac)
- Automatic timestamps when marking tasks as done
- Visual indication of completed tasks (strikethrough)
- Support for projects, tasks, and tags
- Folding support for projects

## Installation

1. Navigate to the extension directory:
   ```bash
   cd taskpaper-extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Package the extension:
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```

5. Install the extension in VS Code:
   - Press `Ctrl+Shift+P` (`Cmd+Shift+P` on Mac)
   - Type "Install from VSIX"
   - Select the generated `.vsix` file

## Usage

1. Create a new file with the `.taskpaper` extension
2. Start writing your tasks in TaskPaper format:
   ```
   Project Name:
       - Task description @tag(value)
       - Another task @done(2024-01-16)
   ```

3. Use `Ctrl+D` (`Cmd+D` on Mac) to toggle tasks as done/undone

## TaskPaper Format

The TaskPaper format is simple and text-based:

- Projects end with a colon (`:`)
- Tasks start with a hyphen and a space (`- `)
- Tags start with `@` and can have values in parentheses
- Indentation is used for hierarchy

Example:
```
Shopping:
    - Buy groceries @priority(high)
    - Get new shoes @done(2024-01-16)

Work:
    Project A:
        - Complete documentation @due(2024-01-20)
        - Review code @done(2024-01-15)
```

## License

MIT 