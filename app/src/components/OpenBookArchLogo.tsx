import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface OpenBookArchLogoProps {
  size?: number;
  color?: string;
  accessibilityLabel?: string;
}

export function OpenBookArchLogo({
  size = 56,
  color = '#143326',
  accessibilityLabel = 'Adaptle',
}: OpenBookArchLogoProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={{ height: size, width: size }}
      testID="open-book-arch-logo">
      <Svg accessibilityElementsHidden fill="none" height={size} viewBox="0 0 200 200" width={size}>
        <Path
          d="M 48 118 L 87 38 C 93 26, 107 26, 113 38 L 152 118 L 127 118 L 100 61 L 73 118 Z"
          fill={color}
        />
        <Path
          d="M 34 136 C 58 128, 82 133, 100 148 C 118 133, 142 128, 166 136"
          stroke={color}
          strokeWidth={18}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
