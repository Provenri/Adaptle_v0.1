# Stitch to Adaptle React Native Builder

This skill is already installed in the repository. Use
[`SKILL.md`](./SKILL.md) for Adaptle's builder workflow.

The upstream example files and validator are retained as reference material,
but Adaptle's authoritative verification workflow is the paired
`stitch-react-native-audit` skill and:

```bash
cd app
npm run audit:stitch
```

The builder:

1. Inspects an accepted Stitch screenshot, HTML, and metadata.
2. Maps the visual into existing Expo Router routes and React Native components.
3. Preserves `DESIGN.md`, `Colors`, `Fonts`, `Spacing`, app behavior, data, and accessibility.
4. Hands generated files to the Adaptle audit.
5. Runs typecheck, focused tests, and relevant lint checks.
