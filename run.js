const http = require('http')
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
    author: "object",
    version: "string"
}

const tsManifestFieldTypes = {
    name: "string",
    version_number: "string",
    website_url: "string",
    description: "string",
    dependencies: "object"
}

const headerFields = {
    MOD_ID: "id",
    //MOD_NAME: "name",
    //MOD_DESCRIPTION: "description",
    //PREFIX: "prefix",
    VERSION: "version",
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

    console.log('parsing', entry.name)

    if (isJson) {
        const data = await res.json()
        if (fieldTypeSatisfy(data, metaFieldTypes)) {
            obj = data
            fmt = 'smods'
            //for (const prop of metaDelProps) delete obj[prop]
        }
        else if (entry.name == "manifest.json" && fieldTypeSatisfy(data, tsManifestFieldTypes)) {
            obj = data
            fmt = 'thunderstore'
            //for (const prop of tsDelProps) delete obj[prop]
        }
    }
    else if (isLua) {
        const data = await res.text()
        const lines = data.split(/\r?\n/)
        if (lines[0] != '--- STEAMODDED HEADER') return

        obj = {}
        fmt = 'smods-header'
        for (const line of lines) {
            const m = line.match(/^--- *(\w+) *:(.*)/)
            if (!m) break
            const [_, prop, val] = m
            if (!headerFields[prop])
            obj[headerFields[prop]] = val
        }
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

    console.log(name, data.repo)

    for (const prop of delprops) delete data[prop]

    const m = data.repo.match(/^https:\/\/([\w.]+)\/([\w.-]+\/[\w.-]+)/)
    if (!m) throw Error('Could not determine repo host from ' + data.repo)

    const meta = await getJsonInfo(m[1], m[2])
    if (!meta) throw Error('Could not determine meta info')

    switch (meta.format) {
        case 'smods':
        case 'smods-header':
            data.id = meta.obj.id
            data.version = meta.obj.version
            break
        case 'thunderstore':
            data.id = meta.obj.name
            data.version = meta.obj.version_number
            break
    }
    //data.meta = meta.obj

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
    const metas = []
    for (const item of items) {
        try {
            metas.push(await handleItem(item))
        } catch(e) {
            console.error(item, 'error:', e)
        }
        console.log()
    }

    const str = JSON.stringify(metas, null)

    await fsp.writeFile('out.json', str)
    await gzip(str).then(v => fsp.writeFile('out.json.gz', v))

    await cp_exec_prm('git add out.json.gz')
    await cp_exec_prm(`git commit -m "auto @ ${t.toUTCString()}"`)
    await cp_exec_prm(`git push origin master`)
}
main()