import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { PanelActivity } from './panel-activity';

vi.mock('@base-ui/react/dialog', () => ({
  Dialog: {
    Root: ({
      open,
      defaultOpen,
      children,
    }: {
      open?: boolean;
      defaultOpen?: boolean;
      children?: ReactNode;
    }) => (
      <div data-open={String(open ?? defaultOpen ?? false)}>{children}</div>
    ),
  },
}));
import { Dialog } from '@/components/ui/dialog';

describe('retained panel portals', () => {
  it('hides a controlled dialog from an inactive retained screen', () => {
    expect(
      renderToStaticMarkup(
        <PanelActivity value={false}>
          <Dialog open />
        </PanelActivity>
      )
    ).toContain('data-open="false"');
  });
  it('also closes an uncontrolled default-open dialog in a hidden panel', () => {
    expect(
      renderToStaticMarkup(
        <PanelActivity value={false}>
          <Dialog defaultOpen />
        </PanelActivity>
      )
    ).toContain('data-open="false"');
  });
  it('preserves dialog behavior outside retained settings', () => {
    expect(renderToStaticMarkup(<Dialog open />)).toContain('data-open="true"');
    expect(
      renderToStaticMarkup(
        <PanelActivity value>
          <Dialog open />
        </PanelActivity>
      )
    ).toContain('data-open="true"');
  });
});
