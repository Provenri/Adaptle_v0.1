import { render } from '@testing-library/react-native';

import { OpenBookArchLogo } from '@/components/OpenBookArchLogo';

describe('OpenBookArchLogo', () => {
  it('renders the accessible default Welcome mark', async () => {
    const screen = await render(<OpenBookArchLogo />);
    const logo = screen.getByLabelText('Adaptle');

    expect(screen.getByTestId('open-book-arch-logo')).toBe(logo);
    expect(logo.props.style).toEqual({ height: 56, width: 56 });
  });

  it('supports Welcome sizing and an alternate label', async () => {
    const screen = await render(
      <OpenBookArchLogo accessibilityLabel="Adaptle welcome mark" color="#173E32" size={88} />
    );

    expect(screen.getByLabelText('Adaptle welcome mark').props.style).toEqual({
      height: 88,
      width: 88,
    });
  });
});
