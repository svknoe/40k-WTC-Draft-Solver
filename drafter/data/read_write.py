import json  # standard libraries

# Version stamp for the cached gamestate/strategy JSONs in a match folder.
# Caches carry solved game values, so any change to the value model makes old
# caches silently wrong (they would load fine and give plausible numbers).
# Bump this whenever cached values are no longer comparable with the current
# engine. Version 5 = packed-integer gamestate keys, index-keyed strategy values
# (issue #13, B2); version 4 = discard_attacker returns the refused attackers to
# the child pools (issue #32); version 3 = numeric ratings on the deviation scale,
# internal = score - 10 (issue #30); version 2 = the 11th-edition best/worst
# map model (issue #9) with the mistaken 2*(score-10) conversion; version 1
# (implicit -- no marker file existed) = the old map-importance model.
CACHE_FORMAT_VERSION = 5
CACHE_FORMAT_FILENAME = "cache_format.json"


def cache_format_is_current(path, friendly_names=None, enemy_names=None):
    # The packed-integer keys are positional (index = name-sorted CSV position),
    # so a cache is only valid if the current CSVs have the same player names in
    # the same order. When names are supplied, reject the cache on any mismatch
    # (issue #13, B2) -- cheap insurance against silent index-remap corruption.
    try:
        with path.open('r', encoding='utf-8') as data_file:
            marker = json.load(data_file)
        if marker.get("cache_format_version") != CACHE_FORMAT_VERSION:
            return False
        if friendly_names is not None and marker.get("friendly_names") != list(friendly_names):
            return False
        if enemy_names is not None and marker.get("enemy_names") != list(enemy_names):
            return False
        return True
    except (OSError, ValueError, AttributeError):
        return False


def write_cache_format_marker(path, friendly_names=None, enemy_names=None):
    marker = {"cache_format_version": CACHE_FORMAT_VERSION}
    if friendly_names is not None:
        marker["friendly_names"] = list(friendly_names)
        marker["enemy_names"] = list(enemy_names)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        json.dump(marker, f)


def read_dictionary(path):
    try:
        with path.open('r', encoding='utf-8') as data_file:
            print("   Reading file {} ...".format(path))
            dictionary = json.load(data_file)
            print('       ...done.')

        return dictionary
    except:
        return None


def write_dictionary(path, dictionary):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8') as f:
        print("   Writing file {} ...".format(path))
        json.dump(dictionary, f, ensure_ascii=False, indent=4)
        print('       ...done.')