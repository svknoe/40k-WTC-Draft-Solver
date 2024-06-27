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
