import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../App.jsx';
import { MaterialPreviewPage } from './MaterialPreviewPage.jsx';
import { materialDemo } from './materialDemo.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('material previews', () => {
  it('shows the complete material title and AI summary when hovering a material row', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '知识库' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: materialDemo[0].fileName }));

    expect(screen.getByRole('tooltip')).toHaveTextContent(materialDemo[0].fileName);
    expect(screen.getByRole('tooltip')).toHaveTextContent(materialDemo[0].summary);
  });

  it('opens the in-app preview route when a material is clicked', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: '知识库' }));
    await userEvent.click(screen.getByRole('button', { name: materialDemo[0].fileName }));

    expect(open).toHaveBeenCalledWith(
      expect.stringMatching(/#\/material\/m1$/),
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('offers an original-site action for link previews', () => {
    const material = materialDemo.find((item) => item.kind === 'link');
    render(<MaterialPreviewPage material={material} />);

    expect(screen.getByRole('heading', { name: material.fileName })).toBeVisible();
    expect(screen.getByText(material.summary)).toBeVisible();
    expect(screen.getByText(material.body)).toBeVisible();
    expect(screen.getByRole('link', { name: '在原站打开' })).toHaveAttribute('href', material.url);
  });

  it('does not offer an original-site action for file previews', () => {
    const material = materialDemo.find((item) => item.kind === 'file');
    render(<MaterialPreviewPage material={material} />);

    expect(screen.queryByRole('link', { name: '在原站打开' })).not.toBeInTheDocument();
  });
});
