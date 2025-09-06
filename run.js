const cp = require('child_process')
const fsp = require('fs/promises')
const util = require('util')
const zlib = require('zlib')

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
    version: "version",
    deps: "dependencies",
    conflicts: "conflicts",
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
    version: "version_number",
    deps: "dependencies",
}

const headerFields = {
    MOD_ID: {
        name: "id"
    },
    VERSION: {
        name: "version"
    },
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
}

const delprops = [
    'requires-steamodded',
    'requires-talisman',
    'automatic-version-check',
    'fixed-release-tag-updates',
    'last-updated',
    'foldername',
    'version'
]

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
        const data = await res.json()
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
        if (!obj) return
    }

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

async function handleItem(name) {
    const content = await fsp.readFile(`bmi/mods/${name}/meta.json`)
    const data = JSON.parse(content)
    data.pathname = name

    for (const prop of delprops) delete data[prop]

    const m = data.repo.match(/^https:\/\/([\w.]+)\/([\w.-]+\/[\w.-]+)/)
    if (!m) throw Error('Could not determine repo host from ' + data.repo)

    const meta = await getJsonInfo(m[1], m[2])
    if (!meta) throw Error('Could not determine meta info')

    const inclFields = meta.format == 'thunderstore' ? tsFieldIncludes : smodsFieldIncludes
    for (const [k, v] of Object.entries(inclFields)) data[k] = meta.obj[v]
    data.metafmt = meta.format

    if (!data.id) throw Error('Could not determine ID')

    return data
}

async function initEnv() {
    const envstr = await fsp.readFile('.env', 'utf-8')
    for (const entry of envstr.split('\n')) {
        const [name] = entry.match(/^[\w_]+/)
        process.env[name] = entry.slice(name.length + 1)
    }
}

async function main() {
    await initEnv()
    const t = new Date()

    if (!fsp.stat('bmi').catch(() => {}))
        await cp_exec_prm('git clone https://github.com/skyline69/balatro-mod-index bmi')

    process.chdir('bmi')
    await cp_exec_prm('git pull')
    process.chdir('..')

    const items = await fsp.readdir('bmi/mods')
    const results = await Promise.all(items.map(async item => {
        try {
            const data = await handleItem(item)
            console.log([item.padEnd(40), data.id.padEnd(30), data.metafmt.padEnd(15), data.version].join(' '))
            return data
        } catch(e) {
            console.error(item, 'failed:', e)
        }
    }))
    const metas = results.filter(v => v)

    const str = JSON.stringify(metas, null)

    await fsp.writeFile('out.json', str)
    await gzip(str).then(v => fsp.writeFile('out.json.gz', v))

    await cp_exec_prm('git add out.json.gz')
    await cp_exec_prm(`git commit -m "auto @ ${t.toUTCString()}"`)
    await cp_exec_prm(`git push origin master`)
}
main()