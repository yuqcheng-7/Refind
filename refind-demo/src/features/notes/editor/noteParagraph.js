import { Paragraph } from '@tiptap/extension-paragraph';
import { NOTE_DEFAULT_STYLE_ID } from './noteTypography.js';

/**
 * Paragraph with body1|body2|body3 via data-body attribute.
 */
export const NoteParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      body: {
        default: NOTE_DEFAULT_STYLE_ID,
        parseHTML: (element) => element.getAttribute('data-body') || NOTE_DEFAULT_STYLE_ID,
        renderHTML: (attributes) => {
          const body = attributes.body || NOTE_DEFAULT_STYLE_ID;
          return { 'data-body': body };
        },
      },
    };
  },
});
