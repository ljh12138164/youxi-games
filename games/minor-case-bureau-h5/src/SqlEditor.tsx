import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/sql/register';
import 'monaco-editor/editor/browser/coreCommands';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/editor/contrib/parameterHints/browser/parameterHints';
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker&inline';
import { getSqlCompletions, getSqlHover, getSqlSignatureHelp } from './completion.ts';
import type { DataTable } from './types.ts';

type Props = { value: string; onChange: (value: string) => void; onExecute: () => void; tables: DataTable[]; disabled?: boolean; error?: string; fontSize?: number };
const kindMap = { table: monaco.languages.CompletionItemKind.Struct, column: monaco.languages.CompletionItemKind.Field, keyword: monaco.languages.CompletionItemKind.Keyword, function: monaco.languages.CompletionItemKind.Function };

export function SqlEditor(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);

  useEffect(() => {
    const host = container.current!;
    const environment = globalThis as unknown as { MonacoEnvironment?: { getWorker: () => Worker } };
    environment.MonacoEnvironment = { getWorker: () => new EditorWorker() };
    monaco.editor.defineTheme('bureau-parchment', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '9C5B1F', fontStyle: 'bold' },
        { token: 'string', foreground: '276761' },
        { token: 'comment', foreground: '68755C' },
        { token: 'number', foreground: '8B4F42' },
      ],
      colors: {
        'editor.background': '#F3EBD8',
        'editor.foreground': '#1D2D37',
        'editorLineNumber.foreground': '#7C826C',
        'editorLineNumber.activeForeground': '#365C58',
        'editor.selectionBackground': '#D9BA7A99',
        'editorCursor.foreground': '#A45D2C',
        'editor.lineHighlightBackground': '#E9E1CA',
        'editorSuggestWidget.background': '#F5EDDA',
        'editorSuggestWidget.foreground': '#192B33',
        'editorSuggestWidget.selectedBackground': '#E5AE5F',
        'editorSuggestWidget.selectedForeground': '#14242B',
        'editorSuggestWidget.highlightForeground': '#9C4A1A',
        'editorSuggestWidget.focusHighlightForeground': '#6E280B',
        'editorSuggestWidget.border': '#4B6C65',
        'list.activeSelectionBackground': '#E5AE5F',
        'list.activeSelectionForeground': '#14242B',
        'list.focusBackground': '#E5AE5F',
        'list.focusForeground': '#14242B',
        'list.hoverBackground': '#E6DEC8',
        'list.hoverForeground': '#192B33',
        'editorHoverWidget.background': '#F7F0DE',
        'editorHoverWidget.foreground': '#192B33',
        'editorHoverWidget.border': '#4B6C65',
      },
    });
    const model = monaco.editor.createModel(latest.current.value, 'sql', monaco.Uri.parse(`inmemory://minor-case-bureau/${crypto.randomUUID()}.sql`));
    modelRef.current = model;
    const editor = monaco.editor.create(host, { model, theme: 'bureau-parchment', fontSize: latest.current.fontSize ?? 15, fontFamily: 'Consolas, "Microsoft YaHei", monospace', lineHeight: 25, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, contextmenu: false, wordWrap: 'on', readOnly: !!latest.current.disabled, lineNumbersMinChars: 2, glyphMargin: false, folding: false, overviewRulerLanes: 0, renderLineHighlight: 'none', fixedOverflowWidgets: true, quickSuggestions: { other: true, strings: false, comments: false }, suggestOnTriggerCharacters: true, wordBasedSuggestions: 'off', tabCompletion: 'on', acceptSuggestionOnEnter: 'on', tabSize: 2, insertSpaces: true, ariaLabel: 'SQL 查询编辑器', unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false, nonBasicASCII: false }, padding: { top: 8, bottom: 8 }, scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 } });
    editorRef.current = editor;
    let composing = false;
    const disposables: monaco.IDisposable[] = [];
    disposables.push(editor.onDidChangeModelContent(() => latest.current.onChange(model.getValue())));
    disposables.push(editor.onDidCompositionStart(() => { composing = true; editor.trigger('input-method', 'hideSuggestWidget', {}); }));
    disposables.push(editor.onDidCompositionEnd(() => { composing = false; }));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => { if (!latest.current.disabled && !composing) latest.current.onExecute(); });
    disposables.push(monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.', ' '],
      provideCompletionItems: (current, position) => {
        if (current !== model || composing) return { suggestions: [] };
        const word = current.getWordUntilPosition(position);
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        return {
          suggestions: getSqlCompletions(current.getValue(), position, latest.current.tables).map(item => ({
            label: { label: item.label, description: item.detail },
            filterText: item.label,
            insertText: item.insertText,
            kind: kindMap[item.kind],
            documentation: { value: item.documentation, isTrusted: false },
            sortText: item.sortText,
            range,
          })),
        };
      },
    }));
    disposables.push(monaco.languages.registerHoverProvider('sql', { provideHover: (current, position) => {
      if (current !== model || composing) return null;
      const info = getSqlHover(current.getValue(), position, latest.current.tables);
      return info ? { contents: [{ value: `**${info.title}**` }, { value: info.detail }, { value: info.documentation }] } : null;
    } }));
    disposables.push(monaco.languages.registerSignatureHelpProvider('sql', { signatureHelpTriggerCharacters: ['(', ','], provideSignatureHelp: (current, position) => {
      if (current !== model || composing) return null;
      const info = getSqlSignatureHelp(current.getValue(), position);
      return info ? { value: { activeSignature: info.activeSignature, activeParameter: info.activeParameter, signatures: info.signatures.map(signature => ({ label: signature.label, documentation: signature.documentation, parameters: signature.parameters.map(parameter => ({ label: parameter.label, documentation: parameter.documentation })) })) }, dispose() {} } : null;
    } }));
    host.dataset.editorReady = 'true';
    (host as unknown as { __setSqlValue?: (v: string) => void }).__setSqlValue = (v: string) => model.setValue(v);
    return () => { delete host.dataset.editorReady; delete (host as unknown as { __setSqlValue?: (v: string) => void }).__setSqlValue; disposables.forEach(d => d.dispose()); editor.dispose(); model.dispose(); editorRef.current = null; modelRef.current = null; };
  }, []);

  useEffect(() => {
    const editor = editorRef.current, model = modelRef.current;
    if (!editor || !model || model.getValue() === props.value) return;
    editor.pushUndoStop(); editor.executeEdits('restored-query', [{ range: model.getFullModelRange(), text: props.value }]); editor.pushUndoStop();
  }, [props.value]);
  useEffect(() => { editorRef.current?.updateOptions({ readOnly: !!props.disabled, fontSize: props.fontSize ?? 15 }); }, [props.disabled, props.fontSize]);
  useEffect(() => {
    const model = modelRef.current; if (!model) return;
    const near = props.error?.match(/near ["']([^"']+)["']/)?.[1];
    const index = near ? model.getValue().indexOf(near) : -1;
    const position = index >= 0 ? model.getPositionAt(index) : null;
    monaco.editor.setModelMarkers(model, 'actual-sqlite-error', position && near ? [{ severity: monaco.MarkerSeverity.Error, message: props.error!, startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column + near.length }] : []);
  }, [props.error]);
  return <div ref={container} className="sql-editor" style={{ height: '100%', minHeight: 100 }} />;
}
