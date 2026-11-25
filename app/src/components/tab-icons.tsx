import Svg, { Circle, Defs, G, Mask, Path, Polygon, Rect } from 'react-native-svg';

export function TabPlayIcon({
  color,
  active = false,
  large = false,
}: {
  color: string;
  active?: boolean;
  large?: boolean;
}) {
  const size = large ? 44 : 24;
  if (!active) {
    return (
      <Svg
        accessibilityElementsHidden
        fill="none"
        height={size}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}>
        <Path d="M2 5h6a4 4 0 0 1 4 4" />
        <Path d="M22 5h-6a4 4 0 0 0-4 4" />
        <Path d="M2 5v13h7a3 3 0 0 1 2.2 1" />
        <Path d="M22 5v13h-7a3 3 0 0 0-2.2 1" />
        <Circle cx="12" cy="12.5" fill="#FFFFFF" r="4.5" stroke={color} strokeWidth="2" />
        <Polygon fill={color} points="11,10.5 14.2,12.5 11,14.5" stroke="none" />
      </Svg>
    );
  }
  return (
    <Svg accessibilityElementsHidden fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <Defs>
        <Mask id="book-play-cutout" maskUnits="userSpaceOnUse">
          <Rect fill="white" height="24" width="24" />
          <Circle cx="12" cy="12.5" fill="black" r="5.5" />
          <Circle cx="12" cy="12.5" fill="white" r="4" />
          <Polygon fill="black" points="11,10.5 14.2,12.5 11,14.5" />
        </Mask>
      </Defs>
      <G fill={color} mask="url(#book-play-cutout)">
        <Path d="M2 4h6a4 4 0 0 1 4 4v11.5a3 3 0 0 0-3-2.5H2V4z" />
        <Path d="M22 4h-6a4 4 0 0 0-4 4v11.5a3 3 0 0 1 3-2.5h7V4z" />
      </G>
    </Svg>
  );
}

export function TabLibraryIcon({ color, active = false }: { color: string; active?: boolean }) {
  if (active) {
    return (
      <Svg accessibilityElementsHidden fill={color} height={24} viewBox="0 0 24 24" width={24}>
        <Rect height="16" rx="1" width="3.8" x="3" y="4" />
        <Rect height="14" rx="1" width="3.8" x="8.5" y="6" />
        <Path d="M14.1 6.8a1 1 0 0 1 .7-1.2l1.9-.5a1 1 0 0 1 1.2.7l3.3 12.5a1 1 0 0 1-.7 1.2l-1.9.5a1 1 0 0 1-1.2-.7L14.1 6.8z" />
      </Svg>
    );
  }
  return (
    <Svg
      accessibilityElementsHidden
      fill="none"
      height={24}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={24}>
      <Rect height="16" rx="0.8" width="3.5" x="3" y="4" />
      <Rect height="14" rx="0.8" width="3.5" x="8.5" y="6" />
      <Path d="M14.2 6.8l3.3-.9 3.6 13.3-3.3.9z" />
    </Svg>
  );
}

export function TabFindIcon({
  color,
  size = 22,
}: {
  color: string;
  active?: boolean;
  size?: number;
}) {
  return (
    <Svg
      accessibilityElementsHidden
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}>
      <Circle cx="10.5" cy="10.5" r="6.5" />
      <Path d="m15.5 15.5 5 5" />
    </Svg>
  );
}
