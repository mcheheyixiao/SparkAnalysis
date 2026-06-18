/**
 * Debug script: Fetch a spark report and print the full normalized analysis pipeline output.
 * Usage: npx tsx scripts/debug-spark-report.ts [sparkCodeOrUrl]
 * Default: kPy1L2N05S
 */
import 'dotenv/config' // load .env
import { parseSparkUrl } from '../src/modules/spark/spark-url.parser.js'
import { sparkFetcher } from '../src/modules/spark/spark-fetcher.service.js'
import { sparkNormalizer } from '../src/modules/spark/spark-normalizer.service.js'
import { sparkRuleAnalyzer } from '../src/modules/spark/spark-rule-analyzer.service.js'
import { safeJsonStringify } from '../src/utils/json.js'

async function main() {
  const arg = process.argv[2] || 'kPy1L2N05S'
  let sparkCode: string

  // Parse URL or code
  if (arg.startsWith('http')) {
    const parsed = parseSparkUrl(arg)
    sparkCode = parsed.code
  } else {
    sparkCode = arg
  }

  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Debug Spark Report: ${sparkCode}`)
  console.log('═══════════════════════════════════════════════════════\n')

  // Stage 1: Fetch raw metadata
  console.log('▶ Stage 1: Fetching raw metadata...')
  const rawData = await sparkFetcher.fetchRawMetadata(sparkCode)
  console.log(`  reportType: ${rawData.reportType}`)
  console.log(`  platform: ${rawData.platform || '(unknown)'}`)
  console.log(`  minecraftVersion: ${rawData.minecraftVersion || '(unknown)'}`)
  console.log(`  sparkVersion: ${rawData.sparkVersion || '(unknown)'}`)
  console.log(`  serverBrand: ${rawData.serverBrand || '(unknown)'}`)
  console.log(`  durationSeconds: ${rawData.durationSeconds ?? '(unknown)'}`)

  // Print raw top-level keys
  const raw = rawData.rawJson as any
  console.log(`  raw top-level keys: ${Object.keys(raw || {}).join(', ')}`)

  // Try to fetch full data
  let normalizedInput = rawData
  try {
    console.log('\n▶ Stage 1b: Fetching full data...')
    const fullJson = await sparkFetcher.fetchFullData(sparkCode)
    normalizedInput = sparkFetcher.mergeRawAndFull(rawData, fullJson)
    const full = fullJson as any
    console.log(`  full top-level keys: ${Object.keys(full || {}).join(', ')}`)
  } catch (err: any) {
    console.log(`  Full fetch skipped: ${err.message}`)
  }

  // Stage 2: Normalize
  console.log('\n▶ Stage 2: Normalizing...')
  const normalized = sparkNormalizer.normalize(normalizedInput)

  console.log('\n── Server Info ──')
  console.log(safeJsonStringify(normalized.server))

  console.log('\n── Health ──')
  console.log(safeJsonStringify(normalized.health))

  console.log('\n── Profiler: Threads ──')
  for (const t of normalized.profiler.threads) {
    console.log(`  [${t.type}] ${t.name} (${t.totalPercent?.toFixed(1) ?? '?'}%)`)
    if (t.topMethods?.length) {
      for (const m of t.topMethods.slice(0, 5)) {
        console.log(`    - ${m.name} (${m.percent?.toFixed(1) ?? '?'}%) [source: ${m.source || '?'}]`)
      }
    }
  }

  console.log('\n── Profiler: Sources ──')
  for (const s of normalized.profiler.sources.slice(0, 20)) {
    console.log(`  [${s.type}] ${s.name}: ${s.totalPercent?.toFixed(1) ?? '?'}%`)
  }
  console.log(`  (total: ${normalized.profiler.sources.length} sources)`)

  console.log('\n── Limitations ──')
  for (const l of normalized.limitations) {
    console.log(`  ⚠ ${l}`)
  }

  console.log('\n── Debug Hints ──')
  for (const h of normalized.debug.extractionHints) {
    console.log(`  🔍 ${h}`)
  }
  console.log(`  rawTopLevelKeys: ${normalized.debug.rawTopLevelKeys.join(', ')}`)
  if (normalized.debug.fullTopLevelKeys) {
    console.log(`  fullTopLevelKeys: ${normalized.debug.fullTopLevelKeys.join(', ')}`)
  }

  // Stage 3: Rule analysis
  console.log('\n▶ Stage 3: Rule analyzing...')
  const ruleAnalysis = sparkRuleAnalyzer.analyze(normalized)

  console.log(`\n  Severity: ${ruleAnalysis.severity}`)
  console.log(`  Summary: ${ruleAnalysis.summary}`)

  console.log('\n── Evidence ──')
  for (const e of ruleAnalysis.evidence) {
    console.log(`  [${e.confidence}] ${e.title}`)
    console.log(`    ${e.detail}`)
  }

  console.log('\n── Suspected Causes ──')
  for (const c of ruleAnalysis.suspectedCauses) {
    console.log(`  [${c.confidence}] ${c.name} (${c.category}) priority=${c.priority}`)
    console.log(`    ${c.reason}`)
  }

  console.log('\n── Recommended Commands ──')
  for (const c of ruleAnalysis.recommendedCommands) {
    console.log(`  $ ${c}`)
  }

  console.log('\n── Rule Limitations ──')
  for (const l of ruleAnalysis.limitations) {
    console.log(`  ⚠ ${l}`)
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════')
  console.log('  Debug Complete')
  console.log('═══════════════════════════════════════════════════════')
}

main().catch((err) => {
  console.error('Debug script error:', err)
  process.exit(1)
})
