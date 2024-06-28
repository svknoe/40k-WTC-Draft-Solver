# 40k-WTC-Draft-Solver

Creates optimal strategies for WTC pairing drafts using game theoretic Nash equilibria.

Required third party packages:

- numpy
- nashpy

Run the script by navigating to ./40k-WTC-Draft-Solver in the terminal and writing:

```
 python -m drafter
```

By default has long runtime (typically more than an hour). Change drafter.data.settings.restricted_attackers_count from 4 to 3 for more reasonable runtime (typically around 15 minutes).

## Package manager

The project uses the `requirements.txt` file to handle packages.

### Setup

The `myenv` folder should automatically be used as a local environment by the code editor. If it is not, type the following to set the correct local environment:

```bash
source myenv/bin/activate    # on Linux/Mac
myenv\Scripts\activate.bat  # on Windows
```

### Updating a package

When adding/updating/deleting a package through `pip`, it is needed to update the `requirements.txt` using the following command:
`pip freeze > requirements.txt`
