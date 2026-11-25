import { View } from 'react-native';
import Svg, { G, Path, Rect } from 'react-native-svg';

interface OpenBookArchAppIconProps {
  size?: number;
  backgroundColor?: string;
  glyphColor?: string;
  accessibilityLabel?: string;
}

export function OpenBookArchAppIcon({
  size = 56,
  backgroundColor = '#143326',
  glyphColor = '#F5F2EB',
  accessibilityLabel = 'Adaptle',
}: OpenBookArchAppIconProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={{ height: size, width: size }}
      testID="open-book-arch-app-icon">
      <Svg accessibilityElementsHidden fill="none" height={size} viewBox="0 0 200 200" width={size}>
        <Rect x="10" y="10" width="180" height="180" rx="42" fill={backgroundColor} />
        <G transform="translate(26, 26) scale(0.74)">
          <Path
            d="M 48 118 L 87 38 C 93 26, 107 26, 113 38 L 152 118 L 127 118 L 100 61 L 73 118 Z"
            fill={glyphColor}
          />
          <Path
            d="M 34 136 C 58 128, 82 133, 100 148 C 118 133, 142 128, 166 136"
            stroke={glyphColor}
            strokeWidth={18}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      </Svg>
    </View>
  );
}
