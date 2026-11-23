import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

export function TabPlayIcon({ color, large = false }: { color: string; large?: boolean }) {
  return (
    <Svg
      accessibilityElementsHidden
      height={large ? 54 : 31}
      width={large ? 76 : 44}
      viewBox="0 0 52 34">
      <G>
        <Path d="m4 25 17 6 4-3-17-6z" fill="#4A9BDE" />
        <Path d="m4 22 17 6 4-3-17-6z" fill="#2E72B8" />
        <Path d="M4 22v3l17 6v-3z" fill="#8FC6F1" />
        <Path d="m6 16 18 5 2-4-18-5z" fill="#E14B3C" />
        <Path d="M6 16v4l18 5v-4z" fill="#C8342B" />
        <Path d="m8 10 18 5 2-4-18-5z" fill="#F05B45" />
        <Path d="M8 10v4l18 5v-4z" fill="#FCE0DA" />
        <G transform="rotate(12 17 8)">
          <Rect fill="#2E9D47" height="11" rx="1.5" width="19" x="6" y="2" />
          <Path d="M8 5h15" stroke="#B9E2A9" strokeWidth="1.5" />
        </G>
      </G>
      <Path d="M29 17h7M32.5 13.5v7" stroke={color} strokeLinecap="round" strokeWidth="2.2" />
      <G>
        <Rect fill="#2F3440" height="17" rx="1.5" width="13" x="38" y="15" />
        <Path d="M38 15h13v5H38z" fill="#EDEDED" />
        <Path d="m38 15 4 5m0-5 4 5m0-5 4 5" stroke="#343A45" strokeWidth="2.2" />
        <Path d="M41 24h7M41 27h4" stroke="#F4F4F4" strokeLinecap="round" strokeWidth="1.2" />
        <G transform="rotate(-12 45 14)">
          <Rect fill="#2F3440" height="5" rx="1" width="13" x="38.5" y="9.5" />
          <Path d="m39 10 3 4m1-4 3 4m1-4 3 4" stroke="#F2F2F2" strokeWidth="2.2" />
        </G>
      </G>
    </Svg>
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
