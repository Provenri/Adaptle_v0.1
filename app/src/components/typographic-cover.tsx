import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text,
} from 'react-native-svg';

import { Depth } from '@/constants/theme';

export const COVER_THEMES = [
  'scifi_teal',
  'thriller_navy',
  'fantasy_plum',
  'literary_terracotta',
  'romance_rose',
  'nonfiction_forest',
] as const;

export type CoverTheme = (typeof COVER_THEMES)[number];

type CoverPalette = {
  start: string;
  end: string;
  ink: string;
  mutedInk: string;
  accent: string;
};

const PALETTES: Record<CoverTheme, CoverPalette> = {
  scifi_teal: {
    start: '#082F34',
    end: '#117579',
    ink: '#FFF6DE',
    mutedInk: '#B8DDD5',
    accent: '#F2A65A',
  },
  thriller_navy: {
    start: '#071628',
    end: '#183B56',
    ink: '#FFF8E7',
    mutedInk: '#AEBFD0',
    accent: '#D7AA55',
  },
  fantasy_plum: {
    start: '#32133E',
    end: '#74446D',
    ink: '#FFF8F1',
    mutedInk: '#DFC7DF',
    accent: '#D9D6C3',
  },
  literary_terracotta: {
    start: '#A84732',
    end: '#D9825B',
    ink: '#FFF5E1',
    mutedInk: '#F2D8C4',
    accent: '#FFE9C8',
  },
  romance_rose: {
    start: '#A95867',
    end: '#D99A89',
    ink: '#FFF8EE',
    mutedInk: '#F8DCD2',
    accent: '#F4C8A8',
  },
  nonfiction_forest: {
    start: '#173E32',
    end: '#47765B',
    ink: '#FFF9E8',
    mutedInk: '#C9DCCB',
    accent: '#B9D29C',
  },
};

type TypographicCoverProps = {
  title: string;
  author: string;
  coverTheme: CoverTheme;
  genre?: string | null;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type TitleLayout = {
  fontSize: number;
  lines: string[];
  lineHeight: number;
};

export function layoutCoverTitle(title: string): TitleLayout {
  const normalized = title.trim().replace(/\s+/g, ' ');
  const length = normalized.length;
  const fontSize = length > 70 ? 18 : length > 48 ? 20 : length > 30 ? 23 : 27;
  const maxCharacters = fontSize <= 20 ? 21 : 17;
  const words = normalized.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (nextLine.length <= maxCharacters || !line) {
      line = nextLine;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  const maxLines = 5;
  if (lines.length > maxLines) {
    const visibleLines = lines.slice(0, maxLines);
    visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]
      .slice(0, maxCharacters - 1)
      .trimEnd()}…`;
    return { fontSize, lines: visibleLines, lineHeight: fontSize * 1.08 };
  }

  return { fontSize, lines, lineHeight: fontSize * 1.08 };
}

export function TypographicCover({
  title,
  author,
  coverTheme,
  genre,
  width = 160,
  style,
  testID = 'typographic-cover',
}: TypographicCoverProps) {
  const palette = PALETTES[coverTheme];
  const titleLayout = layoutCoverTitle(title);
  const accessibilityLabel = `${title}, by ${author}${genre ? `, ${genre}` : ''}`;
  const titleY = titleLayout.lines.length <= 2 ? 123 : 102;
  const authorY = Math.max(178, titleY + titleLayout.lineHeight * titleLayout.lines.length + 16);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[styles.cover, { width }, style]}
      testID={testID}>
      <View style={styles.artwork}>
        <Svg viewBox="0 0 200 300" width="100%" height="100%">
          <Defs>
            <LinearGradient id={`${coverTheme}-gradient`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={palette.start} />
              <Stop offset="1" stopColor={palette.end} />
            </LinearGradient>
          </Defs>
          <Rect width="200" height="300" fill={`url(#${coverTheme}-gradient)`} />
          <CoverMotif coverTheme={coverTheme} palette={palette} />

          {genre ? (
            <Text
              x="100"
              y="30"
              fill={palette.mutedInk}
              fontSize="8"
              fontFamily="sans-serif"
              fontWeight="700"
              letterSpacing="1.8"
              textAnchor="middle">
              {genre.toUpperCase()}
            </Text>
          ) : null}

          {titleLayout.lines.map((line, index) => (
            <Text
              key={`${line}-${index}`}
              x="100"
              y={titleY + index * titleLayout.lineHeight}
              fill={palette.ink}
              fontSize={titleLayout.fontSize}
              fontFamily="serif"
              fontWeight="700"
              textAnchor="middle">
              {line}
            </Text>
          ))}

          <Line x1="78" x2="122" y1={authorY - 14} y2={authorY - 14} stroke={palette.accent} />
          <Text
            x="100"
            y={authorY}
            fill={palette.mutedInk}
            fontSize="11"
            fontFamily="sans-serif"
            fontWeight="600"
            letterSpacing="0.7"
            textAnchor="middle">
            {author.toUpperCase()}
          </Text>
          <Text
            x="100"
            y="281"
            fill={palette.mutedInk}
            fontSize="7"
            fontFamily="sans-serif"
            fontWeight="700"
            letterSpacing="2.4"
            textAnchor="middle">
            ADAPTLE EDITION
          </Text>
        </Svg>
      </View>
    </View>
  );
}

function CoverMotif({ coverTheme, palette }: { coverTheme: CoverTheme; palette: CoverPalette }) {
  switch (coverTheme) {
    case 'scifi_teal':
      return (
        <G opacity="0.38" fill="none" stroke={palette.accent}>
          <Circle cx="100" cy="88" r="68" strokeWidth="2" />
          <Circle cx="100" cy="88" r="48" strokeWidth="1" />
          <Circle cx="149" cy="48" r="7" fill={palette.accent} stroke="none" />
          <Path d="M12 194 C55 155 145 155 188 194" strokeWidth="2" />
        </G>
      );
    case 'thriller_navy':
      return (
        <G opacity="0.24" stroke={palette.accent}>
          {[25, 60, 95, 130, 165].map((x) => (
            <Line key={`vertical-${x}`} x1={x} x2={x} y1="0" y2="300" />
          ))}
          {[55, 95, 135, 175, 215, 255].map((y) => (
            <Line key={`horizontal-${y}`} x1="0" x2="200" y1={y} y2={y} />
          ))}
          <Path d="M18 236 L92 162 L182 236 Z" fill={palette.accent} fillOpacity="0.12" />
        </G>
      );
    case 'fantasy_plum':
      return (
        <G fill={palette.accent} opacity="0.32">
          <Path d="M142 38 A43 43 0 1 0 166 111 A38 38 0 1 1 142 38 Z" />
          <Path d="M47 213 l4 9 10 1 -8 6 3 10 -9 -5 -9 5 3 -10 -8 -6 10 -1 Z" />
          <Circle cx="159" cy="205" r="3" />
          <Circle cx="52" cy="70" r="2.5" />
          <Circle cx="174" cy="160" r="2" />
        </G>
      );
    case 'literary_terracotta':
      return (
        <G fill="none" stroke={palette.accent} opacity="0.45">
          <Rect x="15" y="15" width="170" height="270" rx="2" strokeWidth="1" />
          <Rect x="22" y="22" width="156" height="256" rx="2" strokeWidth="0.5" />
          <Path d="M100 22 L100 45 M89 33 L111 33" />
        </G>
      );
    case 'romance_rose':
      return (
        <G fill={palette.accent} opacity="0.2">
          <Circle cx="45" cy="83" r="64" />
          <Circle cx="158" cy="206" r="72" />
          <Circle cx="168" cy="54" r="24" fill="none" stroke={palette.ink} strokeWidth="2" />
        </G>
      );
    case 'nonfiction_forest':
      return (
        <G fill={palette.accent} opacity="0.22">
          <Rect x="0" y="38" width="12" height="224" />
          <Rect x="18" y="76" width="7" height="186" />
          <Rect x="175" y="0" width="8" height="210" />
          <Rect x="188" y="35" width="12" height="230" />
          <Path d="M35 250 H165 V257 H35 Z" />
        </G>
      );
  }
}

const styles = StyleSheet.create({
  cover: {
    ...Depth.raised,
    aspectRatio: 2 / 3,
    borderRadius: 4,
    backgroundColor: '#173E32',
  },
  artwork: {
    borderRadius: 4,
    flex: 1,
    overflow: 'hidden',
  },
});
