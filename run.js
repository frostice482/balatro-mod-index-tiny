const cp = require('child_process')
const fs = require('fs')
const fsp = require('fs/promises')
const util = require('util')
const zlib = require('zlib')

process.chdir(__dirname)

const cp_exec_prm = util.promisify(cp.exec)

async function main() {
    process.chdir('bmi')
    const t = new Date()

    if (!fsp.stat('bmi').catch(() => {}))
        await cp_exec_prm('git clone https://github.com/skyline69/balatro-mod-index bmi')

    await cp_exec_prm('git pull')

    const items = await fsp.readdir('mods')
    const metas = items.map(v => [v, fsp.readFile(`mods/${v}/meta.json`)])

    const fout = fs.createWriteStream('../out.json.gz')
    const out = zlib.createGzip()
    out.pipe(fout)

    out.write('{')
    for (const [i, [name, content]] of metas.entries()) {
        if (i != 0) out.write(',')
        out.write(JSON.stringify(name) + ":")
        out.write(await content)
    }
    out.write('}')

    await new Promise(res => out.end(res))

    process.chdir('..')

    await cp_exec_prm('git add out.json.gz')
    await cp_exec_prm(`git commit -m "auto @ ${t.toUTCString()}"`)
}
main()