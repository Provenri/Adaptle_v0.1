# Adaptle_v0.1

## Google Stitch MCP

This repository configures Google's remote Stitch MCP server in `.mcp.json`.
Authentication uses the `STITCH_API_KEY` Codespaces secret, referenced by
name in the configuration. The secret itself must never be committed.

The Codespaces secret must have access to this repository. After adding or
changing it, stop and restart the Codespace so GitHub injects the updated
environment variable. Then restart or enable the `stitch` MCP server from
Copilot's **MCP Servers** customization view.
