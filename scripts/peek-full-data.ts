/**
 * Quick peek at full data structure for kPy1L2N05S
 */
import 'dotenv/config'
import { sparkFetcher } from '../src/modules/spark/spark-fetcher.service.js'

async function main() {
  const rawData = await sparkFetcher.fetchRawMetadata('kPy1L2N05S')
  const fullJson = await sparkFetcher.fetchFullData('kPy1L2N05S')
  const full = fullJson as any

  // Check threads structure
  if (full.threads) {
    console.log('── Full threads (type):', typeof full.threads)
    if (Array.isArray(full.threads)) {
      console.log(`  Array length: ${full.threads.length}`)
      const t0 = full.threads[0]
      console.log('  First thread keys:', Object.keys(t0 || {}).join(', '))
      console.log('  First thread name:', t0?.name)
      console.log('  First thread percent:', t0?.percent)
      if (t0?.children && Array.isArray(t0.children)) {
        console.log(`  First thread children count: ${t0.children.length}`)
        for (const c of t0.children.slice(0, 5)) {
          console.log(`    - ${c.name} (${c.percent}%)`)
        }
      }
    } else {
      console.log('  Object keys:', Object.keys(full.threads).slice(0, 10).join(', '))
    }
  }

  // Check classSources/methodSources
  if (full.classSources) {
    console.log('\n── classSources type:', typeof full.classSources)
    if (typeof full.classSources === 'object') {
      const entries = Object.entries(full.classSources as Record<string, any>).slice(0, 5)
      for (const [name, data] of entries) {
        console.log(`  ${name}: ${JSON.stringify(data)}`)
      }
    }
  }

  if (full.methodSources) {
    console.log('\n── methodSources type:', typeof full.methodSources)
    if (typeof full.methodSources === 'object') {
      const entries = Object.entries(full.methodSources as Record<string, any>).slice(0, 5)
      for (const [name, data] of entries) {
        console.log(`  ${name}: ${JSON.stringify(data)}`)
      }
    }
  }

  // Check timeWindowStatistics for TPS
  if (full.timeWindowStatistics) {
    console.log('\n── timeWindowStatistics:', JSON.stringify(full.timeWindowStatistics).slice(0, 500))
  }

  // Check metadata for TPS
  if (full.metadata) {
    console.log('\n── metadata keys:', Object.keys(full.metadata).join(', '))
    const md = full.metadata as any
    if (md.tps) console.log('  tps:', JSON.stringify(md.tps))
    if (md.mspt) console.log('  mspt:', JSON.stringify(md.mspt))
    if (md.platform) console.log('  platform:', JSON.stringify(md.platform))
  }

  console.log('\n── Full top-level keys:', Object.keys(full).join(', '))
}

main().catch(console.error)
