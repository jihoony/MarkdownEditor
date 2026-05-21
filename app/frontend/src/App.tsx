import { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import { marked } from 'marked';
import mermaid from 'mermaid';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import { OpenFile, SaveFile, ReadFile } from '../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime';

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
  const [viewMode, setViewMode] = useState<'split' | 'source' | 'viewer'>('split');
  const [currentFile, setCurrentFile] = useState<string>('');
  const [isModified, setIsModified] = useState(false);
  const [toc, setToc] = useState<TOCNode[]>([]);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const viewerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  
  // For scroll sync
  const isSyncingRef = useRef<'editor' | 'viewer' | null>(null);
  const syncTimeoutRef = useRef<any>(null);

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
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // Scroll Sync: Editor -> Viewer
    editor.onDidScrollChange((e: any) => {
      if (isSyncingRef.current === 'viewer') return;
      isSyncingRef.current = 'editor';
      
      const viewer = viewerRef.current;
      if (viewer) {
        const editorScrollHeight = editor.getScrollHeight();
        const editorClientHeight = editor.getLayoutInfo().height;
        const editorMaxScroll = editorScrollHeight - editorClientHeight;
        const percentage = editorMaxScroll > 0 ? e.scrollTop / editorMaxScroll : 0;
        
        const viewerMaxScroll = viewer.scrollHeight - viewer.clientHeight;
        viewer.scrollTop = percentage * viewerMaxScroll;
      }
      
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        isSyncingRef.current = null;
      }, 50);
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
      const viewerMaxScroll = viewer.scrollHeight - viewer.clientHeight;
      const percentage = viewerMaxScroll > 0 ? viewer.scrollTop / viewerMaxScroll : 0;
      
      const editorScrollHeight = editor.getScrollHeight();
      const editorClientHeight = editor.getLayoutInfo().height;
      const editorMaxScroll = editorScrollHeight - editorClientHeight;
      
      editor.setScrollTop(percentage * editorMaxScroll);
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

  // Drag and Drop support
  useEffect(() => {
    const handleDrop = async (x: number, y: number, paths: string[]) => {
      if (paths && paths.length > 0) {
        try {
          const result = await ReadFile(paths[0]);
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
    EventsOn("wails:file-drop", handleDrop);
    return () => EventsOff("wails:file-drop");
  }, []);

  const handleHtml5Drop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
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

  const handleHtml5DragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

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
          handleOpen();
        } else if (isCtrlMeta && code === 'KeyN') {
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
          setTableModalOpen(true);
        } else if (isCtrlMeta && code === 'Backslash') {
          e.preventDefault();
          e.stopPropagation();
          setSidebarOpen(prev => !prev);
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

    marked.use({ renderer });
    
    // Parse markdown synchronously for this version of marked
    const parsed = marked.parse(markdown) as string;
    setHtml(parsed);

    // Parse TOC
    const lines = markdown.split('\n');
    const newToc: TOCNode[] = [];
    const stack: TOCNode[] = [];

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
      }
    });
    setToc(newToc);
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
    }
  }, [html, viewMode]);

  return (
    <div 
      className="app-container" 
      onDrop={handleHtml5Drop} 
      onDragOver={handleHtml5DragOver}
    >
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>Outline</span>
            <button title="Close Outline (Ctrl+\)" onClick={() => setSidebarOpen(false)} style={{background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'}}>✕</button>
          </div>
          <div className="sidebar-content" style={{ padding: '8px 0' }}>
            {toc.length > 0 ? (
              <TOCView nodes={toc} onNavigate={scrollToLine} />
            ) : (
              <p style={{color: 'var(--text-secondary)', fontSize: '0.9em', padding: '0 16px'}}>No headings found.</p>
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
           <div style={{flex: 1, textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9em'}}>
             {currentFile ? currentFile.split(/[/\\]/).pop() : 'Untitled'} {isModified && '*'}
           </div>
           <button title="Keyboard Shortcuts (F1)" onClick={() => setHelpModalOpen(true)}>❓ Help</button>
           <button title="New File (Ctrl+N)" onClick={handleNew}>New</button>
           <button title="Open File (Ctrl+O)" onClick={handleOpen}>Open</button>
           <button title="Save (Ctrl+S) / Save As (Ctrl+Shift+S)" onClick={handleSave}>Save</button>
           <button title="Print / Export PDF (Ctrl+P)" onClick={() => window.print()}>Print</button>
        </header>
        
        <div className={`workspace mode-${viewMode}`}>
            {(viewMode === 'split' || viewMode === 'source') && (
              <div className="editor-pane">
                <Editor 
                  height="100%" 
                  defaultLanguage="markdown" 
                  theme="custom-light"
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
                    fontFamily: "'Fira Code', monospace"
                  }}
                />
              </div>
            )}
            {(viewMode === 'split' || viewMode === 'viewer') && (
              <div className="viewer-pane" ref={viewerRef} onScroll={handleViewerScroll}>
                <div 
                  className="markdown-body" 
                  dangerouslySetInnerHTML={{ __html: html }} 
                />
              </div>
            )}
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
              <span>Open File</span><kbd>Ctrl + O</kbd>
              <span>Save</span><kbd>Ctrl + S</kbd>
              <span>Save As</span><kbd>Ctrl + Shift + S</kbd>
              <span>Print / Export PDF</span><kbd>Ctrl + P</kbd>
              
              <strong style={{color: 'var(--text-primary)', marginTop: '12px'}}>View & Interface</strong><span></span>
              <span>Toggle Outline</span><kbd>Ctrl + \</kbd>
              <span>Cycle View Mode</span><kbd>Ctrl + M</kbd>

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
