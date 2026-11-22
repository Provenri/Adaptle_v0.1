import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

export function TabPlayIcon({ color }: { color: string }) {
  return (
    <Svg accessibilityElementsHidden height={26} width={30} viewBox="0 0 32 28">
      <Path
        d="M2.5 6.5c4.4-1.7 7.5-.8 10.5 1.8v15c-3-2.5-6.1-3.4-10.5-1.7z"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <Path
        d="M13 8.3c2.3-1.9 4.9-2.7 7.7-2.4M13 23.3c1.6-1.3 3.3-2.1 5-2.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <Rect
        fill="none"
        height="14"
        rx="2.5"
        stroke={color}
        strokeWidth="1.8"
        width="12"
        x="18"
        y="2.5"
      />
      <Path d="m22.5 6.5 4.5 3-4.5 3z" fill={color} />
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
