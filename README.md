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

## Docker setup

You need to have [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Orbstack](https://orbstack.dev/) installed.

```bash
# build
docker build . -t drafter

# run container and get access to container console
docker run -it -v $(pwd):/code -p 8888:8888 drafter bash
# note: -p 8888:8888 maps port 8888 to your host machine and is needed for jupyter notebooks
# note: -v $(pwd):/code mounts your current working directory (presumably your project directory) and makes any changes instantly available in the running container
```

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
