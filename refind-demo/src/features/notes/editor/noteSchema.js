import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import Heading from '@tiptap/extension-heading';
import { NoteParagraph } from './noteParagraph.js';
import { NOTE_DEFAULT_STYLE_ID } from './noteTypography.js';

export { NoteParagraph } from './noteParagraph.js';
export { applyNoteStyle, getActiveNoteStyleId } from './noteStyleCommands.js';

export function createNoteExtensions({ placeholder = '开始记录…' } = {}) {
  return [
    StarterKit.configure({
      heading: false,
      paragraph: false,
      codeBlock: false,
      horizontalRule: false,
      underline: false,
      link: false,
    }),
    NoteParagraph,
    Heading.configure({ levels: [1, 2, 3] }),
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right'],
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    }),
    Placeholder.configure({ placeholder }),
  ];
}
