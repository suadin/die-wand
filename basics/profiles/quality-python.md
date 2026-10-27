# quality-python

Adds static checks for a Python app.

`basics.json` names the commands:

```json
{
  "commands": {
    "lint": "ruff check .",
    "format": "ruff format --check ."
  }
}
```

The standard names the rule; the app owns the tool and its configuration. A new check
enters as advisory in a minor version and becomes mandatory in the next major version.
