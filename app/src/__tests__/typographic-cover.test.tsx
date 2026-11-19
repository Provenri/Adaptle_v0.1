import { render } from '@testing-library/react-native';

import { COVER_THEMES, TypographicCover, layoutCoverTitle } from '@/components/typographic-cover';

describe('TypographicCover', () => {
  it.each(COVER_THEMES)('renders the %s theme', async (coverTheme) => {
    const { getByTestId, getByLabelText } = await render(
      <TypographicCover
        title="Do Androids Dream of Electric Sheep?"
        author="Philip K. Dick"
        coverTheme={coverTheme}
        genre="Science fiction"
      />
    );

    expect(getByTestId('typographic-cover')).toBeTruthy();
    expect(
      getByLabelText('Do Androids Dream of Electric Sheep?, by Philip K. Dick, Science fiction')
    ).toBeTruthy();
  });

  it('supports a responsive width and omits a missing genre from its label', async () => {
    const { getByLabelText, getByTestId } = await render(
      <TypographicCover title="Dune" author="Frank Herbert" coverTheme="fantasy_plum" width="75%" />
    );

    expect(getByLabelText('Dune, by Frank Herbert')).toBeTruthy();
    expect(getByTestId('typographic-cover').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: '75%' })])
    );
  });
});

describe('layoutCoverTitle', () => {
  it('wraps a title without splitting ordinary words', () => {
    const layout = layoutCoverTitle('A Very Long Journey Through The Stars');

    expect(layout.lines.join(' ')).toBe('A Very Long Journey Through The Stars');
    expect(layout.lines.length).toBeGreaterThan(1);
  });

  it('limits very long titles and preserves an ellipsis', () => {
    const layout = layoutCoverTitle(
      'The Incredibly Long and Thorough Account of Every Remarkable Adventure Beyond the Known World and Across the Far Reaches of the Galaxy'
    );

    expect(layout.lines).toHaveLength(5);
    expect(layout.lines.at(-1)).toMatch(/…$/);
  });
});
