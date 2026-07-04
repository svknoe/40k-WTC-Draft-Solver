import json  # standard libraries

# Version stamp for the cached gamestate/strategy JSONs in a match folder.
# Caches carry solved game values, so any change to the value model makes old
# caches silently wrong (they would load fine and give plausible numbers).
# Bump this whenever cached values are no longer comparable with the current
# engine. Version 2 = the 11th-edition best/worst map model (issue #9);
# version 1 (implicit -- no marker file existed) = the old map-importance model.
CACHE_FORMAT_VERSION = 2
CACHE_FORMAT_FILENAME = "cache_format.json"


def cache_format_is_current(path):
    try:
        with path.open('r', encoding='utf-8') as data_file:
            marker = json.load(data_file)
        return marker.get("cache_format_version") == CACHE_FORMAT_VERSION
    except (OSError, ValueError, AttributeError):
        return False


def write_cache_format_marker(path):
    with path.open('w', encoding='utf-8') as f:
        json.dump({"cache_format_version": CACHE_FORMAT_VERSION}, f)


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
    with path.open('w', encoding='utf-8') as f:
        print("   Writing file {} ...".format(path))
        json.dump(dictionary, f, ensure_ascii=False, indent=4)
        print('       ...done.')