import { render } from '@testing-library/react-native';

import { OpenBookArchAppIcon } from '@/components/OpenBookArchAppIcon';

describe('OpenBookArchAppIcon', () => {
  it('renders the accessible default app tile', async () => {
    const screen = await render(<OpenBookArchAppIcon />);
    const icon = screen.getByLabelText('Adaptle');

    expect(screen.getByTestId('open-book-arch-app-icon')).toBe(icon);
    expect(icon.props.style).toEqual({ height: 56, width: 56 });
  });

  it('supports page-specific sizing and labels', async () => {
    const screen = await render(
      <OpenBookArchAppIcon
        accessibilityLabel="Adaptle score card"
        backgroundColor="#163C32"
        glyphColor="#FFFFFF"
        size={34}
      />
    );

    expect(screen.getByLabelText('Adaptle score card').props.style).toEqual({
      height: 34,
      width: 34,
    });
  });
});
