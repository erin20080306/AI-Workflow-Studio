import { describe, expect, it } from 'vitest';

import { PRODUCT } from './product';

describe('PRODUCT', () => {
  it('keeps user-facing identity in one immutable configuration', () => {
    expect(PRODUCT).toMatchObject({
      displayName: 'AI Workflow Studio',
      slug: 'ai-workflow-studio',
      desktopAppId: 'com.aiworkflowstudio.desktop',
    });
    expect(Object.keys(PRODUCT)).toEqual(['displayName', 'slug', 'desktopAppId', 'supportEmail']);
  });
});
