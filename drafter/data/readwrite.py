import json  # standard libraries


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