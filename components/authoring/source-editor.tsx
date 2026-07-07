'use client';

import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useMemo } from 'react';

/**
 * On-brand theme for the MyST source editor (design tokens from
 * app/globals.css / tailwind.config.ts): JetBrains Mono body text, paper
 * background, accent-tinted active line/selection. Module-level constants
 * (not recreated per render) since CodeMirror extensions are meant to be
 * stable references.
 */
const EDITOR_THEME = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    backgroundColor: 'var(--color-paper)',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    caretColor: 'var(--color-ink)',
    padding: '16px 0',
  },
  '.cm-line': {
    padding: '0 20px',
  },
  '.cm-gutters': {
    fontFamily: 'var(--font-mono)',
    backgroundColor: 'var(--color-paper)',
    color: 'var(--color-muted)',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(67, 80, 126, 0.06)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(67, 80, 126, 0.06)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--color-selection) !important',
  },
});

/** Sets the label on CodeMirror's actual contenteditable element (it already gets `role="textbox"` from @codemirror/view itself). */
const ARIA_LABEL_EXTENSION = EditorView.contentAttributes.of({ 'aria-label': 'MyST source editor' });

export interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
}

/**
 * Client-only MyST source editor (PRD §6.1 Markdown-first authoring), a
 * thin on-brand wrapper around @uiw/react-codemirror + @codemirror/lang-markdown.
 * The value it holds/emits is the exact chapter source text -- including
 * any `<!-- blk:blk_xxx -->` stable-id markers (lib/content/stable-ids.ts)
 * -- so callers must never strip or reformat it before handing it to the
 * save action; doing so would defeat the stable-id invariant.
 */
export function SourceEditor({ value, onChange, editable = true }: SourceEditorProps) {
  const extensions = useMemo(
    () => [markdown(), EditorView.lineWrapping, EDITOR_THEME, ARIA_LABEL_EXTENSION],
    [],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      editable={editable}
      height="100%"
      theme="light"
      className="h-full"
    />
  );
}
