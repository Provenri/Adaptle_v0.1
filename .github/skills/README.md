# Adaptle Stitch skills

These project skills are adapted from
[`google-labs-code/stitch-skills`](https://github.com/google-labs-code/stitch-skills).
That upstream project is Google Labs-maintained and uses the Agent Skills open
standard, but states that it is not an officially supported Google product.

Local adaptations:

- Skill names use Copilot-compatible lowercase kebab-case.
- `DESIGN.md` is stored at the repository root.
- Stitch uploads use `STITCH_API_KEY` from the Codespaces environment.
- The React Native workflow targets this Expo Router repository and explicitly
  avoids Tailwind, shadcn/ui, React DOM, and React Navigation assumptions.
- `stitch-react-native` builds against Adaptle's architecture, while
  `stitch-react-native-audit` verifies generated or changed native source with
  the `app` audit command.
- The design system is recorded in `.stitch/metadata.json`.

The upstream Apache 2.0 license is included as `STITCH-SKILLS-LICENSE`.
Review upstream updates before replacing these adapted copies.
