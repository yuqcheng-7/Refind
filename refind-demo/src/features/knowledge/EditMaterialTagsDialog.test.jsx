import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditMaterialTagsDialog } from './EditMaterialTagsDialog.jsx';

afterEach(() => {
  cleanup();
});

describe('EditMaterialTagsDialog', () => {
  it('saves normalized tag list', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <EditMaterialTagsDialog
        open
        initialTags={['增长']}
        onSave={onSave}
        onClose={() => {}}
      />,
    );

    await user.type(screen.getByRole('textbox', { name: '标签' }), '研究{Enter}');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(['增长', '研究']);
  });

  it('does not render when closed', () => {
    render(
      <EditMaterialTagsDialog
        open={false}
        initialTags={['增长']}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
