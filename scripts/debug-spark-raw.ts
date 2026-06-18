/**
 * Debug script: fetches spark raw=?1 and raw=1&full=true,
 * prints key structure without writing raw data to the repo.
 *
 * Usage: npx tsx scripts/debug-spark-raw.ts <code>
 * Example: npx tsx scripts/debug-spark-raw.ts kPy1L2N05S
 */

const code = process.argv[2]
if (!code) {
  console.error('Usage: npx tsx scripts/debug-spark-raw.ts <code>')
  process.exit(1)
}

async function safeFetch(url: string, maxBytes: number = 5 * 1024 * 1024): Promise<{ status: number; contentType: string; contentLength: string; body: string; bodySize: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    const contentType = res.headers.get('content-type') || 'unknown'
    const contentLength = res.headers.get('content-length') || 'unknown'
    const status = res.status

    const buf = await res.arrayBuffer()
    clearTimeout(timeout)

    if (buf.byteLength > maxBytes) {
      const text = new TextDecoder().decode(buf.slice(0, maxBytes))
      return { status, contentType, contentLength, body: text, bodySize: buf.byteLength }
    }

    const text = new TextDecoder().decode(buf)
    return { status, contentType, contentLength, body: text, bodySize: buf.byteLength }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

function printKeys(obj: unknown, prefix = '', maxDepth = 3, depth = 0): void {
  if (depth >= maxDepth) return
  if (obj == null) return
  if (typeof obj !== 'object') return

  if (Array.isArray(obj)) {
    console.log(`${prefix}[array of ${obj.length} items]`)
    if (obj.length > 0) {
      printKeys(obj[0], prefix + '  [0].', maxDepth, depth + 1)
    }
    return
  }

  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    if (val == null) {
      console.log(`${prefix}${key}: null`)
    } else if (Array.isArray(val)) {
      console.log(`${prefix}${key}: [${val.length} items]`)
      if (val.length > 0) {
        printKeys(val[0], `${prefix}  ${key}[0].`, maxDepth, depth + 1)
      }
    } else if (typeof val === 'object') {
      console.log(`${prefix}${key}: {object}`)
      if (depth < maxDepth - 1) {
        printKeys(val, `${prefix}  ${key}.`, maxDepth, depth + 1)
      }
    } else {
      const strVal = String(val)
      const truncated = strVal.length > 120 ? strVal.slice(0, 120) + '...' : strVal
      console.log(`${prefix}${key}: ${truncated}`)
    }
  }
}

async function main() {
  // --- Test 1: ?raw=1 ---
  console.log('='.repeat(70))
  console.log(`Testing: https://spark.lucko.me/${code}?raw=1`)
  console.log('='.repeat(70))

  let rawResult
  try {
    rawResult = await safeFetch(`https://spark.lucko.me/${code}?raw=1`)
    console.log(`HTTP Status: ${rawResult.status}`)
    console.log(`Content-Type: ${rawResult.contentType}`)
    console.log(`Content-Length: ${rawResult.contentLength}`)
    console.log(`Body Size: ${rawResult.bodySize.toLocaleString()} bytes`)
    console.log()

    let rawJson: any = null
    try {
      rawJson = JSON.parse(rawResult.body)
      console.log('Top-level keys:', Object.keys(rawJson).join(', '))
      console.log()
      printKeys(rawJson, '', 4)
    } catch {
      console.log('(body is not valid JSON, showing first 500 chars)')
      console.log(rawResult.body.slice(0, 500))
    }

    // Check for specific structures
    if (rawJson) {
      console.log()
      console.log('--- Structure detection ---')
      console.log('type:', rawJson.type || rawJson.metadata?.type || 'not found')
      console.log('has metadata:', !!rawJson.metadata)
      console.log('has data:', !!rawJson.data)
      console.log('has sampler:', !!rawJson.sampler || !!rawJson.metadata?.sampler)
      console.log('has profiler:', !!rawJson.profiler || !!rawJson.metadata?.profiler)
      console.log('has health:', !!rawJson.health || !!rawJson.metadata?.health)
      console.log('has sources:', !!rawJson.sources || this?.sources)
      console.log('has threads:', !!rawJson.threads || !!rawJson.metadata?.threads)

      // Dig deeper for health metrics
      const tpsObj = rawJson?.tps || rawJson?.metadata?.tps || rawJson?.health?.tps
      const msptObj = rawJson?.mspt || rawJson?.metadata?.mspt || rawJson?.health?.mspt
      console.log('has TPS:', !!tpsObj)
      console.log('has MSPT:', !!msptObj)
    }
  } catch (err) {
    console.error('raw=1 fetch failed:', err)
  }

  console.log()
  console.log()

  // --- Test 2: ?raw=1&full=true ---
  console.log('='.repeat(70))
  console.log(`Testing: https://spark.lucko.me/${code}?raw=1&full=true`)
  console.log('='.repeat(70))

  try {
    const fullResult = await safeFetch(`https://spark.lucko.me/${code}?raw=1&full=true`, 50 * 1024 * 1024)
    console.log(`HTTP Status: ${fullResult.status}`)
    console.log(`Content-Type: ${fullResult.contentType}`)
    console.log(`Content-Length: ${fullResult.contentLength}`)
    console.log(`Body Size: ${fullResult.bodySize.toLocaleString()} bytes`)
    console.log()

    let fullJson: any = null
    try {
      fullJson = JSON.parse(fullResult.body)
      console.log('Top-level keys:', Object.keys(fullJson).join(', '))
      console.log()
      printKeys(fullJson, '', 3)
    } catch {
      console.log('(body is not valid JSON, showing first 500 chars)')
      console.log(fullResult.body.slice(0, 500))
    }

    // Check for specific structures
    if (fullJson) {
      console.log()
      console.log('--- Structure detection ---')
      console.log('type:', fullJson.type || fullJson.metadata?.type || 'not found')
      console.log('has metadata:', !!fullJson.metadata)
      console.log('has data:', !!fullJson.data)
      console.log('has sampler:', !!fullJson.sampler)
      console.log('has profiler:', !!fullJson.profiler)
      console.log('has health:', !!fullJson.health)
      console.log('has sources:', !!fullJson.sources)

      // Check for deep structures
      const md = fullJson.metadata || {}
      const data = fullJson.data || fullJson

      // TPS/MSPT/Health
      const healthData = data?.health || fullJson?.health || {}
      const tpsObj = data?.tps || fullJson?.tps || healthData?.tps
      const msptObj = data?.mspt || fullJson?.mspt || healthData?.mspt
      console.log('has TPS:', !!tpsObj, tpsObj ? `(${JSON.stringify(tpsObj).slice(0, 100)})` : '')
      console.log('has MSPT:', !!msptObj, msptObj ? `(${JSON.stringify(msptObj).slice(0, 100)})` : '')

      // Sources
      const sources = data?.sources || fullJson?.sources
      if (sources && typeof sources === 'object') {
        const srcKeys = Object.keys(sources)
        console.log(`sources: ${srcKeys.length} entries`)
        if (srcKeys.length > 0) {
          console.log(`  first 5: ${srcKeys.slice(0, 5).join(', ')}`)
          // Check if sources have percent
          const firstSrc = sources[srcKeys[0]]
          console.log(`  first source structure:`, Object.keys(firstSrc || {}).join(', '))
          console.log(`  first source example:`, JSON.stringify(firstSrc).slice(0, 200))
        }
      } else {
        console.log('sources: not found')
      }

      // Thread data
      const threads = data?.sampler?.threads || data?.threads || fullJson?.sampler?.threads || fullJson?.threads
      if (threads) {
        if (Array.isArray(threads)) {
          console.log(`threads: array of ${threads.length}`)
          if (threads.length > 0) {
            console.log(`  first thread keys:`, Object.keys(threads[0] || {}).join(', '))
            console.log(`  first thread:`, JSON.stringify(threads[0]).slice(0, 300))
          }
        } else if (typeof threads === 'object') {
          const threadKeys = Object.keys(threads)
          console.log(`threads: object with ${threadKeys.length} keys`)
          console.log(`  keys: ${threadKeys.slice(0, 10).join(', ')}`)
        }
      } else {
        console.log('threads: not found')
      }

      // Call tree / profiler tree
      const callTree = data?.sampler?.callTree || data?.callTree || fullJson?.sampler?.callTree || fullJson?.callTree
      const calltree = data?.calltree || fullJson?.calltree
      console.log('has callTree:', !!callTree)
      console.log('has calltree:', !!calltree)

      // timeWindowStatistics
      const tws = data?.timeWindowStatistics || fullJson?.timeWindowStatistics
      console.log('has timeWindowStatistics:', !!tws)
      if (tws) {
        const twsKeys = Object.keys(tws)
        console.log(`  windows: ${twsKeys.length}`, twsKeys.slice(0, 5))
      }

      // platform info
      const platform = md?.platform || fullJson?.platform
      console.log('platform:', platform ? JSON.stringify(platform).slice(0, 200) : 'not found')
    }
  } catch (err) {
    console.error('full=true fetch failed:', err)
  }
}

main().catch(console.error)
