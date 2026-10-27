# quality-typescript

Adds static checks for a TypeScript or JavaScript app.

`basics.json` names the commands:

```json
{
  "commands": {
    "lint": "pnpm lint",
    "typecheck": "pnpm typecheck"
  }
}
```

The standard names the rule; the app owns the tool and its configuration. A new check
enters as advisory in a minor version and becomes mandatory in the next major version.
