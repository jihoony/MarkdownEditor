import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { marked } from 'marked';
import mermaid from 'mermaid';
import hljs from 'highlight.js';
import lightThemeCss from 'highlight.js/styles/github.css?inline';
import darkThemeCss from 'highlight.js/styles/github-dark.css?inline';
import DOMPurify from 'dompurify';
import { OpenFile, SaveFile, ReadFile, SaveImage, CopyImageToWorkspace, ListDirectory, ReadImageBase64 } from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';
import { EventsOn, EventsOff, ClipboardGetText, OnFileDrop, OnFileDropOff } from '../wailsjs/runtime/runtime';
import 'katex/dist/katex.min.css';
import markedKatex from 'marked-katex-extension';

interface TOCNode {
  id: string;
  text: string;
  level: number;
  line: number;
  headingIndex: number;
  children: TOCNode[];
}

const TOCView = ({ nodes, onNavigate }: { nodes: TOCNode[], onNavigate: (line: number, headingIndex: number) => void }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [id]: prev[id] === undefined ? false : !prev[id] }));
  };

  if (!nodes || nodes.length === 0) return null;

  return (
    <ul style={{ listStyle: 'none', paddingLeft: '12px', margin: '4px 0' }}>
      {nodes.map(node => {
        const isExp = expanded[node.id] !== false;
        return (
          <li key={node.id} style={{ margin: '6px 0', fontSize: '0.9em' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'var(--text-primary)' }}
              onClick={() => onNavigate(node.line, node.headingIndex)}
            >
              <span 
                onClick={(e) => toggle(node.id, e)} 
                style={{ width: '16px', display: 'inline-block', color: 'var(--text-secondary)' }}
              >
                {node.children.length > 0 ? (isExp ? '▼' : '▶') : ''}
              </span>
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.text}
              </span>
            </div>
            {isExp && node.children.length > 0 && (
              <TOCView nodes={node.children} onNavigate={onNavigate} />
            )}
          </li>
        );
      })}
    </ul>
  );
};

// Initialize mermaid
mermaid.initialize({ startOnLoad: false, theme: 'default' });

const defaultMarkdown = `# Welcome to Markdown Editor 🚀

This is a **cross-platform** desktop Markdown Editor built with Go, Wails v2, and React.

## Features
- **Split View:** Edit source on the left, view on the right
- **Mermaid Support:** Write diagrams in code blocks
- **Fast:** Powered by Golang backend

## Example Mermaid Diagram
\`\`\`mermaid
graph TD;
    A[Markdown] -->|Parsed via marked| B(HTML)
    B --> C{View Mode}
    C -->|Split| D[Left Editor, Right Viewer]
    C -->|Viewer Only| E[Viewer Full Screen]
\`\`\`

## Math Example
This editor supports **KaTeX** math rendering!

Block Math (Einstein's Mass-Energy Equivalence):
$$ E = mc^2 $$

Inline Math: You can write formulas like $a^2 + b^2 = c^2$ directly in a sentence!

## Table Example
| Syntax | Description |
| ----------- | ----------- |
| Header | Title |
| Paragraph | Text |

*Enjoy editing!*
`;

export default function App() {
  const [markdown, setMarkdown] = useState(defaultMarkdown);
  const [html, setHtml] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'outline'|'explorer'>('outline');
  const [explorerFiles, setExplorerFiles] = useState<main.FileInfo[]>([]);
  const [workspaceDir, setWorkspaceDir] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'source' | 'viewer'>('split');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isTypewriterMode, setIsTypewriterMode] = useState(false);
  const [currentFile, setCurrentFile] = useState<string>('');
  const currentFileRef = useRef<string>('');
  const isFocusModeRef = useRef(false);
  const isTypewriterModeRef = useRef(false);
  const decorationsCollectionRef = useRef<any>(null);
  const [isModified, setIsModified] = useState(false);
  const [toc, setToc] = useState<TOCNode[]>([]);
  const flatTocRef = useRef<{line: number, headingIndex: number}[]>([]);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const viewerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const cursorPositionRef = useRef<any>(null);
  
  // For scroll sync
  const isSyncingRef = useRef<'editor' | 'viewer' | null>(null);
  const syncTimeoutRef = useRef<any>(null);



  useEffect(() => {
    isFocusModeRef.current = isFocusMode;
    if (decorationsCollectionRef.current) {
      if (!isFocusMode) {
        decorationsCollectionRef.current.clear();
      } else if (editorRef.current && monacoRef.current) {
        const position = editorRef.current.getPosition();
        if (position) {
          const lineNumber = position.lineNumber;
          const lineCount = editorRef.current.getModel()?.getLineCount() || 1;
          const newDecorations = [];
          if (lineNumber > 1) {
            newDecorations.push({
               range: new monacoRef.current.Range(1, 1, lineNumber - 1, 1),
               options: { isWholeLine: true, inlineClassName: 'focus-dim-line' }
            });
          }
          if (lineNumber < lineCount) {
            newDecorations.push({
               range: new monacoRef.current.Range(lineNumber + 1, 1, lineCount, 1),
               options: { isWholeLine: true, inlineClassName: 'focus-dim-line' }
            });
          }
          decorationsCollectionRef.current.set(newDecorations);
        }
      }
    }
  }, [isFocusMode]);

  useEffect(() => {
    isTypewriterModeRef.current = isTypewriterMode;
  }, [isTypewriterMode]);

  useEffect(() => {
    currentFileRef.current = currentFile;
    if (currentFile) {
      const dir = currentFile.substring(0, Math.max(currentFile.lastIndexOf('/'), currentFile.lastIndexOf('\\')));
      if (dir && dir !== workspaceDir) {
        setWorkspaceDir(dir);
      }
    }
  }, [currentFile]);

  useEffect(() => {
    if (sidebarTab === 'explorer' && workspaceDir) {
      ListDirectory(workspaceDir).then(files => {
        setExplorerFiles(files || []);
      }).catch(err => console.error("Failed to list directory:", err));
    }
  }, [sidebarTab, workspaceDir]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
    
    const styleId = 'hljs-theme';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    // @ts-ignore
    styleEl.textContent = isDarkMode ? darkThemeCss : lightThemeCss;
  }, [isDarkMode]);

  // Sidebar resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(150, Math.min(e.clientX, 600));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        // Ensure editor resizes when layout changes
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.layout();
          }
        }, 50);
      }
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleEditorWillMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword.md', foreground: '#005cc5', fontStyle: 'bold' },
        { token: 'strong.md', foreground: '#d73a49', fontStyle: 'bold' },
        { token: 'emphasis.md', foreground: '#d73a49', fontStyle: 'italic' },
        { token: 'string.link.md', foreground: '#6f42c1', fontStyle: 'underline' },
        { token: 'string.md', foreground: '#032f62' },
        { token: 'variable.md', foreground: '#e36209', fontStyle: 'bold' },
        { token: 'comment.md', foreground: '#6a737d', fontStyle: 'italic' },
        { token: 'type.md', foreground: '#22863a', fontStyle: 'bold' },
        { token: 'tag.md', foreground: '#22863a' }
      ],
      colors: {
        'editor.background': '#f8f9fa',
        'editorLineNumber.foreground': '#adb5bd',
        'editor.selectionBackground': '#b3d4fc'
      }
    });

    monaco.editor.defineTheme('custom-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.md', foreground: '#79c0ff', fontStyle: 'bold' },
        { token: 'strong.md', foreground: '#ff7b72', fontStyle: 'bold' },
        { token: 'emphasis.md', foreground: '#ff7b72', fontStyle: 'italic' },
        { token: 'string.link.md', foreground: '#d2a8ff', fontStyle: 'underline' },
        { token: 'string.md', foreground: '#a5d6ff' },
        { token: 'variable.md', foreground: '#ffa657', fontStyle: 'bold' },
        { token: 'comment.md', foreground: '#8b949e', fontStyle: 'italic' },
        { token: 'type.md', foreground: '#7ee787', fontStyle: 'bold' },
        { token: 'tag.md', foreground: '#7ee787' }
      ],
      colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#c9d1d9',
        'editorLineNumber.foreground': '#484f58',
        'editor.lineHighlightBackground': '#161b22',
        'editor.selectionBackground': '#264f78'
      }
    });
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Scroll Sync: Editor -> Viewer
    editor.onDidScrollChange((e: any) => {
      if (isSyncingRef.current === 'viewer') return;
      isSyncingRef.current = 'editor';
      
      const viewer = viewerRef.current;
      if (viewer) {
        if (flatTocRef.current.length > 0) {
          const visibleRanges = editor.getVisibleRanges();
          if (visibleRanges && visibleRanges.length > 0) {
            const topVisibleLine = visibleRanges[0].startLineNumber;
            let indexA = -1;
            for (let i = 0; i < flatTocRef.current.length; i++) {
              if (flatTocRef.current[i].line <= topVisibleLine) {
                indexA = i;
              } else {
                break;
              }
            }
            
            const headings = viewer.querySelectorAll('h1, h2, h3, h4, h5, h6') as NodeListOf<HTMLElement>;
            
            if (indexA === -1) {
              const headingB = flatTocRef.current[0];
              const targetB = headings[headingB.headingIndex];
              if (targetB && headingB.line > 1) {
                const progress = (topVisibleLine - 1) / (headingB.line - 1);
                viewer.scrollTop = progress * (targetB.offsetTop - 32);
              } else {
                viewer.scrollTop = 0;
              }
            } else if (indexA === flatTocRef.current.length - 1) {
              const headingA = flatTocRef.current[indexA];
              const targetA = headings[headingA.headingIndex];
              if (targetA) {
                const editorLineCount = editor.getModel()?.getLineCount() || 1;
                const remainingLines = editorLineCount - headingA.line;
                const progress = remainingLines > 0 ? (topVisibleLine - headingA.line) / remainingLines : 0;
                const viewerMaxScroll = viewer.scrollHeight - viewer.clientHeight;
                const startScroll = targetA.offsetTop - 32;
                viewer.scrollTop = startScroll + progress * (viewerMaxScroll - startScroll);
              }
            } else {
              const headingA = flatTocRef.current[indexA];
              const headingB = flatTocRef.current[indexA + 1];
              const targetA = headings[headingA.headingIndex];
              const targetB = headings[headingB.headingIndex];
              if (targetA && targetB && headingB.line > headingA.line) {
                const progress = (topVisibleLine - headingA.line) / (headingB.line - headingA.line);
                const startScroll = targetA.offsetTop - 32;
                const endScroll = targetB.offsetTop - 32;
                viewer.scrollTop = startScroll + progress * (endScroll - startScroll);
              }
            }
          }
        } else {
          // Fallback to percentage
          const editorScrollHeight = editor.getScrollHeight();
          const editorClientHeight = editor.getLayoutInfo().height;
          const editorMaxScroll = editorScrollHeight - editorClientHeight;
          const percentage = editorMaxScroll > 0 ? e.scrollTop / editorMaxScroll : 0;
          
          const viewerMaxScroll = viewer.scrollHeight - viewer.clientHeight;
          viewer.scrollTop = percentage * viewerMaxScroll;
        }
      }
      
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        isSyncingRef.current = null;
      }, 50);
    });

    decorationsCollectionRef.current = editor.createDecorationsCollection([]);
    editor.onDidChangeCursorPosition((e: any) => {
      cursorPositionRef.current = e.position;
      
      if (isTypewriterModeRef.current) {
         editor.revealPositionInCenter(e.position, monaco.editor.ScrollType.Smooth);
      }
      
      if (isFocusModeRef.current) {
         const lineNumber = e.position.lineNumber;
         const lineCount = editor.getModel()?.getLineCount() || 1;
         
         const newDecorations = [];
         if (lineNumber > 1) {
            newDecorations.push({
               range: new monaco.Range(1, 1, lineNumber - 1, 1),
               options: { isWholeLine: true, inlineClassName: 'focus-dim-line' }
            });
         }
         if (lineNumber < lineCount) {
            newDecorations.push({
               range: new monaco.Range(lineNumber + 1, 1, lineCount, 1),
               options: { isWholeLine: true, inlineClassName: 'focus-dim-line' }
            });
         }
         decorationsCollectionRef.current.set(newDecorations);
      }
    });

    // Bind native Monaco commands for maximum reliability
    for (let i = 1; i <= 6; i++) {
      const keyCodeName = `Digit${i}` as keyof typeof monaco.KeyCode;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode[keyCodeName], () => toggleHeading(i));
      editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode[keyCodeName], () => toggleHeading(i));
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => toggleFormat('**', '**'));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => toggleFormat('*', '*'));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC, () => toggleFormat('\n```\n', '\n```\n'));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT, () => setTableModalOpen(true));
    
    // Override Monaco's default Ctrl+V using Wails native clipboard API
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async () => {
      try {
        const text = await ClipboardGetText();
        if (!text) return;

        let handled = false;
        const lines = text.split('\n');
        
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          
          if (line.startsWith('file://')) {
            try {
              const url = new URL(line);
              line = decodeURI(url.pathname);
            } catch(e) {}
          }
          line = line.replace(/^["']|["']$/g, '');
          
          if (line.startsWith('/')) {
            const ext = line.split('.').pop()?.toLowerCase() || '';
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
            
            if (isImage) {
              if (!currentFileRef.current) {
                alert("이미지를 붙여넣기 전에 문서를 먼저 저장해 주세요.");
                return;
              }
              try {
                const relPath = await CopyImageToWorkspace(line, currentFileRef.current);
                insertTextAtCursor(`![image](${relPath})`);
                handled = true;
                break;
              } catch (err) {
                console.error("Failed to copy image file:", err);
                alert("이미지 복사에 실패했습니다.");
              }
            }
          }
        }

        if (!handled) {
          insertTextAtCursor(text);
        }
      } catch (err) {
        console.error("Failed to read clipboard:", err);
      }
    });
  };

  const scrollToLine = useCallback((line: number, headingIndex: number) => {
    if (viewMode === 'source' || viewMode === 'split') {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column: 1 });
        editorRef.current.focus();
      }
    }
    
    if (viewMode === 'viewer' || viewMode === 'split') {
      if (viewerRef.current) {
        const headings = viewerRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const target = headings[headingIndex];
        if (target) {
          isSyncingRef.current = 'viewer'; // Temporarily disable scroll sync during click navigation
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = setTimeout(() => { isSyncingRef.current = null; }, 1000);
        }
      }
    }
  }, [viewMode]);

  const handleViewerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingRef.current === 'editor') return;
    isSyncingRef.current = 'viewer';
    
    const editor = editorRef.current;
    if (editor) {
      const viewer = e.currentTarget;
      
      if (flatTocRef.current.length > 0) {
        const headings = viewer.querySelectorAll('h1, h2, h3, h4, h5, h6') as NodeListOf<HTMLElement>;
        const viewerTop = viewer.scrollTop + 32;
        
        let indexA = -1;
        for (let i = 0; i < flatTocRef.current.length; i++) {
          const target = headings[flatTocRef.current[i].headingIndex];
          if (target && target.offsetTop <= viewerTop) {
            indexA = i;
          } else {
            break;
          }
        }
        
        let targetLine = 1;
        if (indexA === -1) {
          const headingB = flatTocRef.current[0];
          const targetB = headings[headingB.headingIndex];
          if (targetB && targetB.offsetTop > 0) {
            const progress = viewerTop / targetB.offsetTop;
            targetLine = 1 + progress * (headingB.line - 1);
          }
        } else if (indexA === flatTocRef.current.length - 1) {
          const headingA = flatTocRef.current[indexA];
          const targetA = headings[headingA.headingIndex];
          if (targetA) {
            const viewerMaxScroll = viewer.scrollHeight - viewer.clientHeight;
            const remainingScroll = viewerMaxScroll - targetA.offsetTop;
            const progress = remainingScroll > 0 ? (viewerTop - targetA.offsetTop) / remainingScroll : 0;
            const editorLineCount = editor.getModel()?.getLineCount() || 1;
            targetLine = headingA.line + progress * (editorLineCount - headingA.line);
          }
        } else {
          const headingA = flatTocRef.current[indexA];
          const headingB = flatTocRef.current[indexA + 1];
          const targetA = headings[headingA.headingIndex];
          const targetB = headings[headingB.headingIndex];
          if (targetA && targetB && targetB.offsetTop > targetA.offsetTop) {
            const progress = (viewerTop - targetA.offsetTop) / (targetB.offsetTop - targetA.offsetTop);
            targetLine = headingA.line + progress * (headingB.line - headingA.line);
          }
        }
        
        editor.setScrollTop(editor.getTopForLineNumber(Math.max(1, Math.floor(targetLine))));
      } else {
        // Fallback to percentage
        const viewerMaxScroll = viewer.scrollHeight - viewer.clientHeight;
        const percentage = viewerMaxScroll > 0 ? viewer.scrollTop / viewerMaxScroll : 0;
        const editorScrollHeight = editor.getScrollHeight();
        const editorClientHeight = editor.getLayoutInfo().height;
        const editorMaxScroll = editorScrollHeight - editorClientHeight;
        editor.setScrollTop(percentage * editorMaxScroll);
      }
    }
    
    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      isSyncingRef.current = null;
    }, 50);
  };

  // File Handlers
  const handleNew = useCallback(() => {
    setMarkdown('');
    setCurrentFile('');
    setIsModified(false);
  }, []);

  const handleOpen = useCallback(async () => {
    try {
      const result = await OpenFile();
      if (result && result.filepath) {
        setMarkdown(result.content);
        setCurrentFile(result.filepath);
        setIsModified(false);
      }
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    try {
      const savedPath = await SaveFile(markdown, currentFile);
      if (savedPath) {
        setCurrentFile(savedPath);
        setIsModified(false);
      }
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  }, [markdown, currentFile]);

  // Editor Formatter Helpers
  const toggleFormat = useCallback((prefix: string, suffix: string = '') => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection) return;
    const model = editor.getModel();
    
    const text = model.getValueInRange(selection);
    
    // 1. Check if selection itself includes the markers
    if (text.startsWith(prefix) && text.endsWith(suffix) && text.length >= prefix.length + suffix.length) {
      if (text === prefix + suffix) {
        editor.executeEdits("format", [{ range: selection, text: '' }]);
      } else {
        const newText = text.substring(prefix.length, text.length - suffix.length);
        editor.executeEdits("format", [{ range: selection, text: newText }]);
      }
      editor.focus();
      return;
    }
    
    // 2. Check if markers are immediately outside the selection
    const startCol = selection.startColumn;
    const endCol = selection.endColumn;
    const maxLineCol = model.getLineMaxColumn(selection.endLineNumber);
    
    const beforeRange = {
      startLineNumber: selection.startLineNumber,
      startColumn: Math.max(1, startCol - prefix.length),
      endLineNumber: selection.startLineNumber,
      endColumn: startCol
    };
    
    const afterRange = {
      startLineNumber: selection.endLineNumber,
      startColumn: endCol,
      endLineNumber: selection.endLineNumber,
      endColumn: Math.min(maxLineCol, endCol + suffix.length)
    };
    
    const textBefore = model.getValueInRange(beforeRange);
    const textAfter = model.getValueInRange(afterRange);
    
    if (textBefore === prefix && textAfter === suffix) {
      const fullRange = {
        startLineNumber: selection.startLineNumber,
        startColumn: beforeRange.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: afterRange.endColumn
      };
      editor.executeEdits("format", [{ range: fullRange, text: text }]);
      editor.focus();
      return;
    }
    
    // 3. Otherwise, add the markers
    const newText = prefix + text + suffix;
    editor.executeEdits("format", [{ range: selection, text: newText }]);
    editor.focus();
  }, []);

  const toggleHeading = useCallback((level: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const position = editor.getPosition();
    if (!position) return;
    const line = position.lineNumber;
    const model = editor.getModel();
    let text = model.getLineContent(line);
    
    const currentHeadingMatch = text.match(/^(#{1,6})\s/);
    if (currentHeadingMatch && currentHeadingMatch[1].length === level) {
      // If it's already the target heading level, toggle it off
      text = text.replace(/^(#{1,6}\s)/, '');
    } else {
      // Otherwise, replace with the new heading level
      text = text.replace(/^(#{1,6}\s)/, '');
      text = '#'.repeat(level) + ' ' + text;
    }
    
    const range = { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: model.getLineMaxColumn(line) };
    editor.executeEdits("format-heading", [{ range, text }]);
    editor.focus();
  }, []);

  const insertTable = useCallback(() => {
    let table = '\n';
    for (let c = 0; c < tableCols; c++) table += '| Header ';
    table += '|\n';
    for (let c = 0; c < tableCols; c++) table += '| --- ';
    table += '|\n';
    for (let r = 0; r < tableRows; r++) {
      for (let c = 0; c < tableCols; c++) table += '| Cell ';
      table += '|\n';
    }
    const editor = editorRef.current;
    if (!editor) return;
    const position = editor.getPosition();
    if (!position) return;
    const range = { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column };
    editor.executeEdits("insert-table", [{ range, text: table }]);
    setTableModalOpen(false);
    editor.focus();
  }, [tableRows, tableCols]);

  const handleSaveAs = useCallback(async () => {
    try {
      const savedPath = await SaveFile(markdown, '');
      if (savedPath) {
        setCurrentFile(savedPath);
        setIsModified(false);
      }
    } catch (err) {
      console.error('Failed to save file as:', err);
    }
  }, [markdown]);

  const handleSearch = useCallback(() => {
    if (editorRef.current) {
      if (viewMode === 'viewer') {
        setViewMode('split');
      }
      editorRef.current.focus();
      editorRef.current.trigger('keyboard', 'actions.find', null);
    }
  }, [viewMode]);

  // Drag and Drop support
  useEffect(() => {
    const handleDrop = async (x: number, y: number, paths: string[]) => {
      if (paths && paths.length > 0) {
        const path = paths[0];
        const ext = path.split('.').pop()?.toLowerCase() || '';
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
        
        if (isImage) {
          if (!currentFileRef.current) {
            alert("이미지를 삽입하기 전에 문서를 먼저 저장해 주세요.");
            return;
          }
          try {
            const relPath = await CopyImageToWorkspace(path, currentFileRef.current);
            insertTextAtCursor(`![image](${relPath})`);
          } catch (err) {
            console.error("Failed to copy dropped image:", err);
            alert("이미지 복사에 실패했습니다.");
          }
          return;
        }

        try {
          const result = await ReadFile(path);
          if (result && result.filepath) {
            setMarkdown(result.content);
            setCurrentFile(result.filepath);
            setIsModified(false);
          }
        } catch (err) {
          console.error("Failed to read dropped file:", err);
        }
      }
    };
    OnFileDrop(handleDrop, true);
    return () => OnFileDropOff();
  }, []);

  const insertTextAtCursor = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const position = editor.getPosition() || cursorPositionRef.current;
    if (!position) return;
    const range = { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column };
    editor.executeEdits("insert-text", [{ range, text }]);
    editor.focus();
  };

  useEffect(() => {
    const handleNativeDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
          if (!currentFileRef.current) {
            alert("이미지를 삽입하기 전에 문서를 먼저 저장해 주세요.");
            return;
          }
          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64 = (event.target?.result as string).split(',')[1];
            try {
              const relPath = await SaveImage(base64, currentFileRef.current, file.name);
              insertTextAtCursor(`![image](${relPath})`);
            } catch (err) {
              console.error("Failed to save dropped image:", err);
            }
          };
          reader.readAsDataURL(file);
          return;
        }
        try {
          const text = await file.text();
          setMarkdown(text);
          const path = (file as any).path || file.name || '';
          setCurrentFile(path);
          setIsModified(false);
        } catch (err) {
          console.error("Failed to read dropped file:", err);
        }
      }
    };

    const handlePaste = async (e: ClipboardEvent) => {
      // 1. Try native WebKit clipboard files (rarely works securely, but good fallback)
      if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isImage = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
        
        if (isImage) {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (!currentFileRef.current) {
            alert("이미지를 붙여넣기 전에 문서를 먼저 저장해 주세요.");
            return;
          }
          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64 = (event.target?.result as string).split(',')[1];
            try {
              const relPath = await SaveImage(base64, currentFileRef.current, file.name || "image.png");
              insertTextAtCursor(`![image](${relPath})`);
            } catch (err) {
              console.error("Failed to paste image file:", err);
              alert("이미지 저장에 실패했습니다.");
            }
          };
          reader.readAsDataURL(file);
          return;
        }
      }

      // 2. Safely read text using Wails backend API (Works around WebKitGTK context menu bug)
      try {
        const text = await ClipboardGetText();
        if (!text) return;

        // Prevent Monaco from ignoring the paste if context menu stole focus
        e.preventDefault();
        e.stopImmediatePropagation();

        let handled = false;
        const lines = text.split('\n');
        
        for (let line of lines) {
          line = line.trim();
          if (!line) continue;
          
          if (line.startsWith('file://')) {
            try {
              const url = new URL(line);
              line = decodeURI(url.pathname);
            } catch(e) {}
          }
          line = line.replace(/^["']|["']$/g, '');
          
          if (line.startsWith('/')) {
            const ext = line.split('.').pop()?.toLowerCase() || '';
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
            
            if (isImage) {
              if (!currentFileRef.current) {
                alert("이미지를 붙여넣기 전에 문서를 먼저 저장해 주세요.");
                return;
              }
              try {
                const relPath = await CopyImageToWorkspace(line, currentFileRef.current);
                insertTextAtCursor(`![image](${relPath})`);
                handled = true;
                break;
              } catch (err) {
                console.error("Failed to copy pasted file image:", err);
                alert("이미지 파일 복사에 실패했습니다.");
              }
            }
          }
        }
        
        if (!handled) {
          insertTextAtCursor(text);
        }
      } catch (err) {
        console.error("Failed to read clipboard text:", err);
      }
    };
    
    window.addEventListener('paste', handlePaste, { capture: true });
    return () => {
      window.removeEventListener('paste', handlePaste, { capture: true });
    };
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const isCtrlMeta = e.ctrlKey || e.metaKey;
      const isModifier = isCtrlMeta || e.altKey;
      
      if (code === 'Escape') {
        setHelpModalOpen(false);
        setTableModalOpen(false);
        return;
      }
      
      if (code === 'F1') {
        e.preventDefault();
        e.stopPropagation();
        setHelpModalOpen(true);
      }
      
      if (isModifier) {
        if (isCtrlMeta && code === 'KeyS') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            handleSaveAs();
          } else {
            handleSave();
          }
        } else if (isCtrlMeta && code === 'KeyO') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            setSidebarOpen(true);
            setSidebarTab('outline');
          } else {
            handleOpen();
          }
        } else if (isCtrlMeta && code === 'KeyN') {
          e.preventDefault();
          e.stopPropagation();
          handleNew();
        } else if (isCtrlMeta && code === 'KeyW') {
          e.preventDefault();
          e.stopPropagation();
          handleNew();
        } else if (isCtrlMeta && code === 'KeyB') {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat('**', '**');
        } else if (isCtrlMeta && code === 'KeyI') {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat('*', '*');
        } else if (isCtrlMeta && code === 'KeyC' && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat('\n```\n', '\n```\n');
        } else if (isCtrlMeta && code === 'KeyP') {
          e.preventDefault();
          e.stopPropagation();
          window.print();
        } else if (isCtrlMeta && code === 'KeyT') {
          e.preventDefault();
          e.stopPropagation();
          if (e.shiftKey) {
            setIsTypewriterMode(prev => !prev);
          } else {
            setTableModalOpen(true);
          }
        } else if (isCtrlMeta && code === 'Backslash') {
          e.preventDefault();
          e.stopPropagation();
          setSidebarOpen(prev => !prev);
        } else if (isCtrlMeta && e.shiftKey && code === 'KeyE') {
          e.preventDefault();
          e.stopPropagation();
          setSidebarOpen(true);
          setSidebarTab('explorer');
        } else if (isCtrlMeta && e.shiftKey && code === 'KeyD') {
          e.preventDefault();
          e.stopPropagation();
          setIsDarkMode(prev => !prev);
        } else if (isCtrlMeta && e.shiftKey && code === 'KeyF') {
          e.preventDefault();
          e.stopPropagation();
          setIsFocusMode(prev => !prev);
        } else if (isCtrlMeta && code === 'KeyM') {
          e.preventDefault();
          e.stopPropagation();
          setViewMode(prev => prev === 'split' ? 'source' : prev === 'source' ? 'viewer' : 'split');
        } else if ((code && code.startsWith('Digit')) || (e.key >= '1' && e.key <= '6') || (code && code.startsWith('Numpad')) || (e.keyCode >= 49 && e.keyCode <= 54)) {
          let num = 0;
          if (code && code.startsWith('Digit')) {
            num = parseInt(code.replace('Digit', ''), 10);
          } else if (code && code.startsWith('Numpad')) {
            num = parseInt(code.replace('Numpad', ''), 10);
          } else if (e.key >= '1' && e.key <= '6') {
            num = parseInt(e.key, 10);
          } else if (e.keyCode >= 49 && e.keyCode <= 54) {
            num = e.keyCode - 48; // keyCode 49 is '1'
          }
          
          if (num >= 1 && num <= 6) {
            e.preventDefault();
            e.stopPropagation();
            toggleHeading(num);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleSave, handleSaveAs, handleOpen, handleNew, toggleHeading, toggleFormat]);

  // Auto Save
  useEffect(() => {
    if (!currentFile || !isModified) return;
    const timer = setTimeout(() => {
      handleSave();
    }, 5000); // 5 seconds auto-save
    return () => clearTimeout(timer);
  }, [markdown, currentFile, isModified, handleSave]);

  const onMarkdownChange = (value: string | undefined) => {
    setMarkdown(value || '');
    setIsModified(true);
  };

  // One-time setup for marked and its extensions
  useEffect(() => {
    // Basic mermaid renderer for marked
    const renderer = new marked.Renderer();
    const originalCode = renderer.code.bind(renderer);
    
    renderer.code = (token: any) => {
      const codeStr = token.text;
      const lang = typeof token.lang === 'string' ? token.lang.trim() : '';

      if (lang === 'mermaid') {
        return `<div class="mermaid">${codeStr}</div>`;
      }
      
      let highlighted = codeStr;
      if (lang && hljs.getLanguage(lang)) {
        try {
          highlighted = hljs.highlight(codeStr, { language: lang }).value;
        } catch (e) {}
      } else {
        highlighted = hljs.highlightAuto(codeStr).value;
      }
      
      const languageClass = lang ? `language-${lang}` : 'hljs';
      return `<pre><code class="${languageClass} hljs">${highlighted}</code></pre>`;
    };

    renderer.image = (token: any) => {
      let href = token.href;
      
      if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('data:')) {
        if (currentFileRef.current) {
           const dir = currentFileRef.current.substring(0, Math.max(currentFileRef.current.lastIndexOf('/'), currentFileRef.current.lastIndexOf('\\')));
           const absolutePath = `${dir}/${href}`;
           
           href = `/localfile?path=${encodeURIComponent(absolutePath)}`;
           return `<img src="${href}" alt="${token.text || ''}" title="${token.title || ''}" style="max-width: 100%;" />`;
        }
      }
      return `<img src="${href}" alt="${token.text || ''}" title="${token.title || ''}" style="max-width: 100%;" />`;
    };

    marked.use({ renderer });
    
    // Setup KaTeX extension
    marked.use(markedKatex({ throwOnError: false }));
  }, []);

  // Debounced parsing to prevent typing lag
  useEffect(() => {
    const timer = setTimeout(() => {
      // Parse markdown synchronously for this version of marked
      const parsed = marked.parse(markdown) as string;
      
      // Configure DOMPurify to allow KaTeX MathML tags and specific attributes
      const purifyConfig = {
        ADD_TAGS: ['math', 'maction', 'maligngroup', 'malignmark', 'menclose', 'merror', 'mfenced', 'mfrac', 'mglyph', 'mi', 'mlabeledtr', 'mlongdiv', 'mmultiscripts', 'mn', 'mo', 'mover', 'mpadded', 'mphantom', 'mroot', 'mrow', 'ms', 'mscarries', 'mscarry', 'msgroup', 'msline', 'mspace', 'msqrt', 'msrow', 'mstack', 'mstyle', 'msub', 'msup', 'msubsup', 'mtable', 'mtd', 'mtext', 'mtr', 'munder', 'munderover', 'semantics', 'annotation', 'annotation-xml'],
        ADD_ATTR: ['target', 'mathvariant', 'mathcolor', 'mathbackground', 'mathsize', 'xmlns', 'display']
      };
      setHtml(DOMPurify.sanitize(parsed, purifyConfig));

      // Parse TOC
      const lines = markdown.split('\n');
      const newToc: TOCNode[] = [];
      const stack: TOCNode[] = [];
      const flatToc: {line: number, headingIndex: number}[] = [];

      let headingCount = 0;
      lines.forEach((lineText, index) => {
        const match = lineText.match(/^(#{1,6})\s+(.*)/);
        // Ensure we are not inside a code block (simple heuristic: not counting backticks perfectly, but good enough for basic TOC)
        if (match) {
          const level = match[1].length;
          const text = match[2];
          const node: TOCNode = {
            id: `toc-${index}`,
            text,
            level,
            line: index + 1,
            headingIndex: headingCount++,
            children: []
          };

          while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
          }

          if (stack.length === 0) {
            newToc.push(node);
          } else {
            stack[stack.length - 1].children.push(node);
          }
          stack.push(node);
          
          flatToc.push({ line: index + 1, headingIndex: headingCount - 1 });
        }
      });
      setToc(newToc);
      flatTocRef.current = flatToc;
    }, 100); // 100ms debounce

    return () => clearTimeout(timer);
  }, [markdown]);

  useEffect(() => {
    // Re-render mermaid diagrams when HTML changes
    if (viewerRef.current) {
      mermaid.run({
        querySelector: '.mermaid',
        nodes: viewerRef.current.querySelectorAll('.mermaid')
      }).catch(err => {
        console.warn('Mermaid rendering error:', err);
      });
      
      // Fix local images by dynamically loading base64 (Bypasses WebKit/Vite issues)
      const imgs = viewerRef.current.querySelectorAll('img');
      imgs.forEach(img => {
        const src = img.getAttribute('src');
        if (src && src.startsWith('/localfile?path=')) {
          const absolutePath = decodeURIComponent(src.split('?path=')[1]);
          if (!img.dataset.loadedBase64) {
             img.dataset.loadedBase64 = "true";
             ReadImageBase64(absolutePath).then(base64 => {
               img.src = `data:image/png;base64,${base64}`;
             }).catch(err => {
               console.warn("Failed to load local image:", err);
             });
          }
        }
      });
    }
  }, [html, viewMode]);

  return (
    <div 
      className="app-container"
    >
      {sidebarOpen && (
        <aside className={`sidebar ${!isResizing ? 'transition-width' : ''}`} style={{ width: sidebarWidth }}>
          <div 
            className={`sidebar-resizer ${isResizing ? 'active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }}
          />
          <div className="sidebar-header" style={{ padding: '8px 16px', display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
              <span 
                style={{ cursor: 'pointer', color: sidebarTab === 'outline' ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: sidebarTab === 'outline' ? '2px solid var(--accent)' : 'none', paddingBottom: '4px' }}
                onClick={() => setSidebarTab('outline')}
              >Outline</span>
              <span 
                style={{ cursor: 'pointer', color: sidebarTab === 'explorer' ? 'var(--text-primary)' : 'var(--text-secondary)', borderBottom: sidebarTab === 'explorer' ? '2px solid var(--accent)' : 'none', paddingBottom: '4px' }}
                onClick={() => setSidebarTab('explorer')}
              >Explorer</span>
            </div>
            <button title="Close Outline (Ctrl+\)" onClick={() => setSidebarOpen(false)} style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}>✕</button>
          </div>
          <div className="sidebar-content" style={{ padding: '8px 0' }}>
            {sidebarTab === 'outline' && (
              toc.length > 0 ? (
                <TOCView nodes={toc} onNavigate={scrollToLine} />
              ) : (
                <p style={{color: 'var(--text-secondary)', fontSize: '0.9em', padding: '0 16px'}}>No headings found.</p>
              )
            )}
            {sidebarTab === 'explorer' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {workspaceDir && <div style={{ fontSize: '0.85em', color: 'var(--text-secondary)', padding: '0 16px 8px 16px', wordBreak: 'break-all', borderBottom: '1px solid var(--border-color)', marginBottom: '8px' }}>📁 {workspaceDir}</div>}
                {!workspaceDir && <p style={{color: 'var(--text-secondary)', fontSize: '0.9em', padding: '0 16px'}}>Save or Open a file to view the folder.</p>}
                {explorerFiles.map((file, i) => (
                  <div 
                    key={i} 
                    onClick={async () => {
                      if (!file.isDir && file.isMd) {
                        try {
                          if (isModified && currentFile) {
                            await SaveFile(markdown, currentFile);
                          }
                          const result = await ReadFile(file.path);
                          if (result && result.filepath) {
                            setMarkdown(result.content);
                            setCurrentFile(result.filepath);
                            setIsModified(false);
                          }
                        } catch(e) {
                          console.error(e);
                        }
                      }
                    }}
                    style={{
                      padding: '4px 16px',
                      cursor: file.isDir || !file.isMd ? 'default' : 'pointer',
                      color: file.path === currentFile ? 'var(--accent)' : 'var(--text-primary)',
                      backgroundColor: file.path === currentFile ? 'var(--border-color)' : 'transparent',
                      fontSize: '0.9em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: (file.isDir || !file.isMd) ? 0.5 : 1
                    }}
                  >
                    {file.isDir ? '📁' : '📄'} {file.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}
      
      <main className="main-content">
        <header className="toolbar">
           {!sidebarOpen && (
             <button title="Open Outline (Ctrl+\)" onClick={() => setSidebarOpen(true)}>☰</button>
           )}
           <button title="Switch View Mode (Ctrl+M)" className={viewMode === 'source' ? 'active' : ''} onClick={() => setViewMode('source')}>Source</button>
           <button title="Switch View Mode (Ctrl+M)" className={viewMode === 'split' ? 'active' : ''} onClick={() => setViewMode('split')}>Split</button>
           <button title="Switch View Mode (Ctrl+M)" className={viewMode === 'viewer' ? 'active' : ''} onClick={() => setViewMode('viewer')}>Viewer</button>
           <button title="Toggle Focus Mode (Ctrl+Shift+F)" onClick={() => setIsFocusMode(!isFocusMode)} className={isFocusMode ? 'active' : ''}>🎯 Focus</button>
           <button title="Toggle Typewriter Mode (Ctrl+Shift+T)" onClick={() => setIsTypewriterMode(!isTypewriterMode)} className={isTypewriterMode ? 'active' : ''}>⌨️ Typewriter</button>
           <button title="Toggle Dark Mode (Ctrl+Shift+D)" onClick={() => setIsDarkMode(!isDarkMode)}>
             {isDarkMode ? '☀️ Light' : '🌙 Dark'}
           </button>
           <div style={{flex: 1, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9em'}}>
             {currentFile ? currentFile.split(/[/\\]/).pop() : 'Untitled'} {isModified && '*'}
           </div>
           <button title="Keyboard Shortcuts (F1)" onClick={() => setHelpModalOpen(true)}>❓ Help</button>
           <button title="Search (Ctrl+F)" onClick={handleSearch}>🔍 Search</button>
           <button title="New File (Ctrl+N)" onClick={handleNew}>New</button>
           <button title="Open File (Ctrl+O)" onClick={handleOpen}>Open</button>
           <button title="Save (Ctrl+S) / Save As (Ctrl+Shift+S)" onClick={handleSave}>Save</button>
           <button title="Print / Export PDF (Ctrl+P)" onClick={() => window.print()}>Print</button>
        </header>
        
        <div className={`workspace mode-${viewMode} ${isFocusMode ? 'focus-mode-active' : ''}`}>
              <div className="editor-pane">
                <Editor 
                  height="100%" 
                  defaultLanguage="markdown" 
                  theme={isDarkMode ? 'custom-dark' : 'custom-light'}
                  value={markdown}
                  onChange={onMarkdownChange}
                  beforeMount={handleEditorWillMount}
                  onMount={handleEditorMount}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    padding: { top: 24, bottom: 24 },
                    fontSize: 14,
                    lineHeight: 1.6,
                    fontFamily: "'Fira Code', monospace",
                    pasteAs: { enabled: false } as any,
                    formatOnPaste: false,
                    dropIntoEditor: { enabled: false } as any,
                    contextmenu: false
                  }}
                />
              </div>
              <div className="viewer-pane" ref={viewerRef} onScroll={handleViewerScroll}>
                <div 
                  className="markdown-body" 
                  dangerouslySetInnerHTML={{ __html: html }} 
                />
              </div>
        </div>
      </main>

      {tableModalOpen && (
        <div className="modal-overlay" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content" style={{backgroundColor: 'var(--panel-bg)', padding: '24px', borderRadius: '8px', width: '250px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'}}>
            <h3 style={{margin: 0, color: 'var(--text-primary)'}}>Insert Table</h3>
            <label style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)'}}>Rows: 
              <input type="number" min="1" value={tableRows} onChange={e => setTableRows(Number(e.target.value))} style={{width: '60px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px'}}/>
            </label>
            <label style={{display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)'}}>Cols: 
              <input type="number" min="1" value={tableCols} onChange={e => setTableCols(Number(e.target.value))} style={{width: '60px', background: 'var(--bg-color)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '4px'}}/>
            </label>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px'}}>
              <button onClick={() => setTableModalOpen(false)} style={{padding: '6px 12px', background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer'}}>Cancel</button>
              <button onClick={insertTable} style={{padding: '6px 12px', background: 'var(--accent)', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600}}>Insert</button>
            </div>
          </div>
        </div>
      )}

      {helpModalOpen && (
        <div className="modal-overlay" onClick={() => setHelpModalOpen(false)} style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000}}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{backgroundColor: 'var(--panel-bg)', padding: '24px', borderRadius: '8px', width: '380px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 style={{margin: 0, color: 'var(--text-primary)'}}>Keyboard Shortcuts</h3>
              <button onClick={() => setHelpModalOpen(false)} style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2em'}}>✕</button>
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', fontSize: '0.9em', color: 'var(--text-secondary)'}}>
              <strong style={{color: 'var(--text-primary)'}}>File Management</strong><span></span>
              <span>New File</span><kbd>Ctrl + N</kbd>
              <span>Close File</span><kbd>Ctrl + W</kbd>
              <span>Open File</span><kbd>Ctrl + O</kbd>
              <span>Save</span><kbd>Ctrl + S</kbd>
              <span>Save As</span><kbd>Ctrl + Shift + S</kbd>
              <span>Print / Export PDF</span><kbd>Ctrl + P</kbd>
              
              <strong style={{color: 'var(--text-primary)', marginTop: '12px'}}>View & Interface</strong><span></span>
              <span>Toggle Sidebar</span><kbd>Ctrl + \</kbd>
              <span>Show Outline Tab</span><kbd>Ctrl + Shift + O</kbd>
              <span>Show Explorer Tab</span><kbd>Ctrl + Shift + E</kbd>
              <span>Cycle View Mode</span><kbd>Ctrl + M</kbd>
              <span>Toggle Dark Mode</span><kbd>Ctrl + Shift + D</kbd>
              <span>Toggle Focus Mode</span><kbd>Ctrl + Shift + F</kbd>
              <span>Toggle Typewriter</span><kbd>Ctrl + Shift + T</kbd>

              <strong style={{color: 'var(--text-primary)', marginTop: '12px'}}>Formatting & Editor</strong><span></span>
              <span>Heading 1-6</span><kbd>Ctrl + 1~6</kbd>
              <span>Heading 1-6 (Alt)</span><kbd>Alt + 1~6</kbd>
              <span>Bold</span><kbd>Ctrl + B</kbd>
              <span>Italic</span><kbd>Ctrl + I</kbd>
              <span>Code Block</span><kbd>Ctrl + Shift + C</kbd>
              <span>Insert Table</span><kbd>Ctrl + T</kbd>
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', marginTop: '8px'}}>
              <button onClick={() => setHelpModalOpen(false)} style={{padding: '6px 12px', background: 'var(--accent)', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600}}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
