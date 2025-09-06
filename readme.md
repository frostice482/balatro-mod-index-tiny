This is a tiny version of [balatro-mod-index](https://github.com/skyline69/balatro-mod-index).
The index repo contains lots of `thumbnail.jpg` files, which fills up the repo size significantly.
This repo aims to reduce the repo size by not including the `thumbnail.jpg`,
and reducing API calls by bundling mod metadata to one file.

## Why is my mod not included?

The `balatro-mod-index` repo does not provide the mod ID.
To overcome this, there is a script to pull the additional mod info (id, version, dependencies, conflicts).

The used script automatically checks for files in your given `repo`.
Your root files in given `repo` must contain any of the following:

- a valid `json` file, fulfilling [Thunderstore metadata](https://thunderstore.io/package/create/docs/)

- a valid `json` file, fulfilling [Steamodded metadata](https://github.com/Steamodded/smods/wiki/Mod-Metadata).

    Note that trailing commas are not allowed.

- a valid `lua` file, fulfilling [Steamodded header metadata](https://github.com/Steamodded/smods/wiki/Mod-Metadata)
