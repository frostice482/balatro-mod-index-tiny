const cp = require('child_process')
const fsp = require('fs/promises')
const util = require('util')
const zlib = require('zlib')
const J5 = require('json5')

const cp_exec_prm = util.promisify(cp.exec)
const gzip = util.promisify(zlib.gzip)
process.chdir(__dirname)

const metaFieldTypes = {
    id: "string",
    name: "string",
    description: "string",
    prefix: "string",
    author: "object"
}

const smodsFieldIncludes = {
    id: "id",
    //version: "version",
    //deps: "dependencies",
    //conflicts: "conflicts",
    provides: "provides",
    description: "description",
}

const tsManifestFieldTypes = {
    name: "string",
    version_number: "string",
    website_url: "string",
    description: "string",
    dependencies: "object"
}

const tsFieldIncludes = {
    id: "name",
    description: "description",
    //version: "version_number",
    //deps: "dependencies",
}

const headerFields = {
    MOD_ID: {
        name: "id"
    },
    MOD_DESCRIPTION: {
        name: "description"
    },
    VERSION: {
        name: "version"
    },
    /*
    DEPS: {
        name: "dependencies",
        array: true,
    },
    DEPENDENCIES: {
        name: "dependencies",
        array: true,
    },
    DEPENDS: {
        name: "dependencies",
        array: true,
    },
    CONFLICTS: {
        name: "conflicts",
        array: true,
    }
    */
}

const delprops = [
    'requires-steamodded',
    'requires-talisman',
    'automatic-version-check',
    'fixed-release-tag-updates',
    'last-updated',
    'foldername',
    //'version'
]

const renameProps = {
    title: 'name',
    author: 'owner',
    downloadURL: 'download_url'
}

function fieldTypeSatisfy(obj, fieldTypes) {
    for (const [k,v] of Object.entries(fieldTypes)) {
        if (typeof(obj[k]) != v) return false
    }
    return true
}

function parseSmodsHeader(data, noPad) {
    const lines = data.split(/\r?\n/)
    const lineitr = lines.values()

    if (!noPad) {
        const [line] = lineitr
        if (line != '--- STEAMODDED HEADER') return
    }

    const obj = {}
    for (const line of lineitr) {
        const m = line.match(/^--- *(\w+) *: *(.*)/)
        if (!m) break

        let [_, prop, val] = m
        const info = headerFields[prop]
        if (!info) continue

        if (info.array) val = val.slice(1, -1).split(',').map(v => v.trim())
        obj[info.name] = val
    }

    return obj
}

async function handleJsonInfo(entry) {
    const isJson = entry.name.endsWith(".json")
    const isLua = entry.name.endsWith(".lua")

    if (!(
        entry.type == "file"
        && entry.name[0] != "."
        && ( isJson || isLua )
    )) return

    const res = await fetch(entry.download_url)
    if (res.status != 200) throw Error(`${res.url} HTTP ${res.status}`)

    let obj, fmt

    if (isJson) {
        const raw = await res.text()
        const data = J5.parse(raw)
        if (fieldTypeSatisfy(data, metaFieldTypes)) {
            obj = data
            fmt = 'smods'
        }
        else if (entry.name == "manifest.json" && fieldTypeSatisfy(data, tsManifestFieldTypes)) {
            obj = data
            fmt = 'thunderstore'
        }
    }
    else if (isLua) {
        const data = await res.text()
        obj = parseSmodsHeader(data)
        fmt = 'smods-header'
    }

    if (!obj) return

    return {
        obj: obj,
        format: fmt
    }
}

async function getJsonInfo(host, repo) {
    if (repo.endsWith('.git')) repo = repo.slice(0, -4)

    let res
    if (host == "github.com") {
        res = await fetch(`https://api.github.com/repos/${repo}/contents`, {
            headers: {
                Authorization: 'Bearer ' + process.env.GITHUB_TOKEN
            }
        })
    } else if (host == "codeberg.org") {
        res = await fetch(`https://${host}/api/v1/repos/${repo}/contents`)
    }

    if (res.status != 200) throw Error(`${res.url} HTTP ${res.status}`)

    const list = await res.json()
    for (const entry of list) {
        const data = await handleJsonInfo(entry)
        if (data) return data
    }
}

async function handleItem(data) {
    for (const prop of delprops) {
        delete data[prop]
    }
    for (const [k, v] of Object.entries(renameProps)) {
        data[v] = data[k]
        delete data[k]
    }

    const m = data.repo.match(/^https:\/\/([\w.]+)\/([\w.-]+\/[\w.-]+)/)
    if (!m) throw Error('Could not determine repo host from ' + data.repo)

    const meta = await getJsonInfo(m[1], m[2]) ?? {
        format: 'smods',
        obj: {
            id: data.pathname,
            description: ''
        }
    }
    //if (!meta) throw Error('Could not determine meta info')

    const inclFields = meta.format == 'thunderstore' ? tsFieldIncludes : smodsFieldIncludes
    for (const [k, v] of Object.entries(inclFields)) data[k] = meta.obj[v]
    data.metafmt = meta.format

    if (!data.id) throw Error('Could not determine ID')

    return data
}

async function main() {
    if (!process.env.GITHUB_TOKEN) throw Error('missing github token')
    const t = new Date()

    const items = await fsp.readdir('bmi/mods')
    const results = await Promise.all(items.map(async item => {
        const file = `bmi/mods/${item}/meta.json`
        const stat = await fsp.stat(file)
        if (!stat.isFile()) return
        const content = await fsp.readFile(file)
        let data
        try {
            data = J5.parse(content)
            data.pathname = item
            data.modtime = stat.mtimeMs

            const res = await handleItem(data)
            console.log([item.padEnd(40), res.id.padEnd(30), res.metafmt.padEnd(15), res.version].join(' '))
            return res
        } catch(e) {
            if (data) {
                console.error(`${item} (${data.repo}) failed: ${e}`)
            } else {
                console.error(`${item} failed: ${e}`)
            }
        }
    }))
    const metas = results.filter(v => v)

    const str = JSON.stringify(metas, null)

    await fsp.writeFile('out.json', str)
    await gzip(str).then(v => fsp.writeFile('out.json.gz', v))

    await cp_exec_prm('git add out.json.gz')
    await cp_exec_prm(`git commit -m "auto @ ${t.toUTCString()}"`)
}
main()
