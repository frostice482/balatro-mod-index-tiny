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
}
type Out = Mod[]
```
