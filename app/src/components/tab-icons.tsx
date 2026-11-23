import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

import { ThemedText } from './themed-text';

export function TabPlayIcon({ large = false }: { color: string; large?: boolean }) {
  return (
    <ThemedText
      accessibilityElementsHidden
      style={{ fontSize: large ? 44 : 22, lineHeight: large ? 50 : 26 }}>
      📚 + 🎬
    </ThemedText>
  );
}

export function TabLibraryIcon({ color }: { color: string }) {
  return (
    <Svg accessibilityElementsHidden height={26} width={32} viewBox="0 0 34 28">
      <Rect fill="#4F91D8" height="18" rx="1.2" width="6" x="2" y="6" />
      <Path d="M2 10h6M2 17h6" stroke="#DCEBFA" strokeWidth="1.5" />
      <Rect fill="#F0B43C" height="15" rx="1.2" width="5" x="9" y="9" />
      <Circle cx="11.5" cy="18.5" fill="#FFE4A8" r="1" />
      <Rect fill="#D36A63" height="20" rx="1.2" width="6" x="15" y="4" />
      <Path d="M15 8h6M15 19h6" stroke="#F7D4D0" strokeWidth="1.3" />
      <G transform="rotate(-12 27 18)">
        <Rect fill="#62A7E3" height="18" rx="1.2" width="5.5" x="24" y="9" />
        <Path d="M24 13h5.5M24 20h5.5" stroke="#E1F0FC" strokeWidth="1.3" />
      </G>
      <Path d="M1 25.5h32" stroke={color} strokeLinecap="round" strokeWidth="2.5" />
    </Svg>
  );
}
