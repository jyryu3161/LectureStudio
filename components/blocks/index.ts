/**
 * Public barrel for the Block presentational components. Internal
 * cross-references (lib/render/render-blocks.tsx) import the specific files
 * directly rather than this barrel, to keep the dependency graph a DAG --
 * see the note at the top of lib/render/render-blocks.tsx.
 */
export { BlockContent } from './block-content';
export { BlockShell } from './block-shell';
export { CodeBlock } from './code';
export { CodeOutputBlock } from './code-output';
export { EquationBlock } from './equation';
export { FigureBlock } from './figure';
export { HeadingBlock } from './heading';
export { InstructorNoteBlock } from './instructor-note';
export { InteractiveDemoBlock } from './interactive-demo';
export { LectureSummaryBlock } from './lecture-summary';
export { ParagraphBlock } from './paragraph';
export { ComingSoonBlock } from './stub';
export { StudentDetailBlock } from './student-detail';
