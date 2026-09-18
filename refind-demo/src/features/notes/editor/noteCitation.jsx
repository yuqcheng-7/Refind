import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { NoteCitationChip } from './NoteCitationChip.jsx';

function CitationNodeView({ node, extension }) {
  const index = Number(node.attrs.index) || 1;
  const cardId = node.attrs.cardId || '';
  const label = node.attrs.label || '';
  const getCard = extension.options.getCard;
  const onOpenCard = extension.options.onOpenCard;
  const card = typeof getCard === 'function' ? getCard(cardId) : null;

  return (
    <NodeViewWrapper as="span" className="note-citation-node" data-drag-handle>
      <NoteCitationChip
        index={index}
        label={label}
        card={card}
        onOpenCard={onOpenCard}
      />
    </NodeViewWrapper>
  );
}

/**
 * Inline citation atom: parses <span data-citation data-card-id data-label>.
 * getCard / onOpenCard are read via extension options (use refs from the editor host).
 */
export function createNoteCitationExtension({ getCard, onOpenCard } = {}) {
  return Node.create({
    name: 'noteCitation',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addOptions() {
      return {
        getCard: getCard || (() => null),
        onOpenCard: onOpenCard || (() => {}),
      };
    },
    addAttributes() {
      return {
        index: {
          default: 1,
          parseHTML: (element) => {
            const value = Number(element.getAttribute('data-citation'));
            return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
          },
          renderHTML: (attributes) => ({ 'data-citation': attributes.index }),
        },
        cardId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-card-id'),
          renderHTML: (attributes) => (
            attributes.cardId ? { 'data-card-id': attributes.cardId } : {}
          ),
        },
        label: {
          default: '',
          parseHTML: (element) => element.getAttribute('data-label') || '',
          renderHTML: (attributes) => (
            attributes.label ? { 'data-label': attributes.label } : {}
          ),
        },
      };
    },
    parseHTML() {
      return [{ tag: 'span[data-citation]' }];
    },
    renderHTML({ node, HTMLAttributes }) {
      return [
        'span',
        mergeAttributes(HTMLAttributes, {
          'data-citation': node.attrs.index,
          ...(node.attrs.cardId ? { 'data-card-id': node.attrs.cardId } : {}),
          ...(node.attrs.label ? { 'data-label': node.attrs.label } : {}),
        }),
        `[${node.attrs.index}]`,
      ];
    },
    addNodeView() {
      return ReactNodeViewRenderer(CitationNodeView);
    },
  });
}
