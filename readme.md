This is a tiny version of [balatro-mod-index](https://github.com/skyline69/balatro-mod-index).
The index repo contains lots of `thumbnail.jpg` files, which fills up the repo size significantly.
This repo aims to reduce the repo size by not including the `thumbnail.jpg`,
and reducing API calls by bundling mod metadata to one file.

## Format

`out.json` is an array of mods.

```ts
interface Mod {
    name: string
    repo: string
    owner: string
    categories: string[]
    version: string
    download_url: string

    // Added fields
    id: string // This will be equal to pathname incase the metadata cannot be extracted
    pathname: string // e.g. `frostice482@imm`
    provides?: string[]
    description: string // This will be empty incase the metadata cannot be extracted
    badge_colour?: string // hex with length 6 or 8
    badge_text_colour?: string // hex with length 6 or 8
    release_prefix?: string // Release tag prefix, see below
}
type Out = Mod[]
```

## Monorepo support

By default, mod metadata is extracted from the repository root. If your repository hosts
more than one mod, the default behavior will not be able to find your mods metadata.
For this case, you will need to explicitly declare your mods and their manifest path
in a dedicated meta file at the repository root, named `bmi-tiny-meta.json`:

```json
{
    "mods": {
        "owner@mod-name-1": {
            "manifest": "mod-path-1/manifest.json",
            "release_prefix": "mod-1-prefix_"
        },
        "owner@mod-name-2": {
            "manifest": "mod-path-2/manifest.json",
            "release_prefix": "mod-2-prefix_"
        },
    }
}
```

- The key is your published mod's path name in the index.
- `manifest` is the path to the mod's smods manifest relative to the repository root.
- `release_prefix` is optional. When set, release tags belonging to this mod are prefixed
  with it (e.g. `mod-name_v1.0.0`).
