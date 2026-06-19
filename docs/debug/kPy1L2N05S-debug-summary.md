# kPy1L2N05S Debug Summary

**Date**: 2026-06-19 (updated P6)
**Sample**: kPy1L2N05S (Forge 1.19.2, TPS 13.95)

## Fetch Status

| Metric | Value |
|--------|-------|
| raw=1 success | ✅ Yes |
| raw body size | ~101 KB |
| full=true success | ✅ Yes |
| full body size | ~30+ MB |
| fullMaxBytes | 50 MB (P3 default) |
| reportType | sampler |

## Full Data Top-Level Keys

`type, metadata, threads, classSources, methodSources, lineSources, timeWindows, timeWindowStatistics, channelInfo`

## Health

| Metric | Value |
|--------|-------|
| TPS latest | 13.95 |
| TPS mean | 13.95 |
| MSPT mean | 66.6 ms |
| MSPT median | 66.6 ms |
| MSPT max | 296.0 ms |
| GC data | ✅ Extracted from `full.metadata.platformStatistics.gc` (P6) |
| Memory | Available in metadata |

## GC Detail (P6)

| Metric | Value |
|--------|-------|
| G1 Young Generation collections | 30 |
| G1 Young Generation avgTime | 23.1 ms |
| G1 Old Generation collections | 0 |
| G1 Old Generation avgTime | 0 ms |
| hasOldGc | false |
| GC is root cause? | No (Old GC = 0, no abnormal times) |

## Main Thread

- Name: "Server thread"
- Children count: 23,154 (flat call tree)
- Top methods show MinecraftServer main loop methods

## Key Findings After P1-P6

1. **Percent calculation**: Now works — methods have 2.2%, 2.1%, etc. (uses `times[]` array sum)
2. **Source mapping**: Works — methods classified as `minecraft`/`java`/`native` by package prefix
3. **No className duplication**: Fixed in `parseMethodNode`
4. **Full fetch failure**: Now writes appropriate limitations when full=true fails
5. **methodSources**: Empty for this sample (only classSources available)
6. **lineSources**: Present in full data, added to SourceIndex
7. **GC extraction**: ✅ P6 — Extracts from `full.metadata.platformStatistics.gc` with object format support. Structured collectors with collections/timeMs/averageTimeMs.
8. **GC rule analysis**: No false GC alerts when Old GC=0 and avgTime is normal.
9. **PromptBuilder**: Passes structured GC data to AI, prevents "missing GC" misreporting.
10. **Markdown report**: Won't display raw JSON, won't falsely claim "缺少 GC 数据".

## Remaining Issues

1. Top methods dominated by MinecraftServer loop methods — DynamicGraphMinFixedPoint and ChunkTracker exist but with lower sample counts
2. Source percent computation for mods: most top methods are `minecraft`, not mod-specific
3. The 187 mod sources all show `?%` because their methods don't appear in top 30
4. Spark raw only provides cumulative GC values — no pause distribution or sample window, so GC cannot be precisely timed against MSPT spikes

## ftbessentials Analysis

- Present in metadata.sources list
- No main thread method evidence
- confidence: low
- canBeRootCause: false
