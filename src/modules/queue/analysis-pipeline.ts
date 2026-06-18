import { prisma } from '../../plugins/prisma.js'
import { AppError } from '../../utils/errors.js'
import { safeJsonStringify } from '../../utils/json.js'
import { logService } from '../logs/log.service.js'
import { sparkFetcher } from '../spark/spark-fetcher.service.js'
import { sparkNormalizer } from '../spark/spark-normalizer.service.js'
import { sparkRuleAnalyzer } from '../spark/spark-rule-analyzer.service.js'
import { promptBuilder } from '../ai/prompt-builder.service.js'
import { aiAnalysisService } from '../ai/ai-analysis.service.js'
import { reportService } from '../reports/report.service.js'
import { settingsService } from '../settings/settings.service.js'

import type { IAnalysisJob } from './queue.interface.js'

class AnalysisPipeline {
  async execute(job: IAnalysisJob): Promise<void> {
    const { reportId, sparkCode } = job

    try {
      // ---- Stage 1: Fetching spark (progress=15) ----
      await reportService.updateStage(reportId, { stage: 'fetching_spark', progress: 15 })

      const rawData = await sparkFetcher.fetchRawMetadata(sparkCode)

      // For sampler/profiler or unknown report types, try to fetch full data
      // to get more complete thread/source information.
      let normalizedInput = rawData
      let fullFetchFailed = false
      let fullFailReason = ''
      if (rawData.reportType === 'sampler' || rawData.reportType === 'unknown') {
        try {
          const fullJson = await sparkFetcher.fetchFullData(sparkCode)
          normalizedInput = sparkFetcher.mergeRawAndFull(rawData, fullJson)
        } catch (err) {
          // Full fetch failure is non-fatal — continue with raw metadata only
          fullFetchFailed = true
          fullFailReason = err instanceof Error ? err.message : 'Unknown error'
          rawData.fullFetchFailed = true
          rawData.fullFailReason = fullFailReason
          await logService.write('warn', 'pipeline', 'Full data fetch failed, continuing with raw metadata', {
            reportId,
            sparkCode,
            reportType: rawData.reportType,
            error: fullFailReason,
          })
        }
      }

      // Save raw if enabled
      const saveRaw = await settingsService.getBoolean('saveRawSparkData')
      const rawJson = saveRaw ? safeJsonStringify(normalizedInput.rawJson) : null

      await reportService.updateStage(reportId, {
        platform: normalizedInput.platform,
        minecraftVersion: normalizedInput.minecraftVersion,
        sparkVersion: normalizedInput.sparkVersion,
        serverBrand: normalizedInput.serverBrand,
        reportType: normalizedInput.reportType,
        durationSeconds: normalizedInput.durationSeconds,
        rawMetadataJson: rawJson,
      })

      // ---- Stage 2: Normalizing (progress=30) ----
      await reportService.updateStage(reportId, { stage: 'normalizing', progress: 30 })

      const normalized = sparkNormalizer.normalize(normalizedInput)
      const saveNormalized = await settingsService.getBoolean('saveNormalizedSummary')

      await reportService.updateStage(reportId, {
        normalizedJson: saveNormalized ? safeJsonStringify(normalized) : null,
      })

      // ---- Stage 3: Rule analyzing (progress=45) ----
      await reportService.updateStage(reportId, { stage: 'rule_analyzing', progress: 45 })

      const ruleAnalysis = sparkRuleAnalyzer.analyze(normalized)

      await reportService.updateStage(reportId, {
        ruleAnalysisJson: safeJsonStringify(ruleAnalysis),
      })

      // ---- Stage 4: Building prompt (progress=60) ----
      await reportService.updateStage(reportId, { stage: 'building_prompt', progress: 60 })

      const prompts = await promptBuilder.build(normalized, ruleAnalysis, normalizedInput.reportType)

      // ---- Stage 5: Calling AI (progress=80) ----
      await reportService.updateStage(reportId, { stage: 'calling_ai', progress: 80 })

      const aiOutput = await aiAnalysisService.analyzeWithPrompts(
        normalized,
        ruleAnalysis,
        normalizedInput.reportType,
        prompts,
      )

      // ---- Stage 6: Saving result (progress=95) ----
      await reportService.updateStage(reportId, { stage: 'saving_result', progress: 95 })

      // Respect saveAiResult system setting: when false, do NOT save the full
      // structured AI JSON. The markdownReport, severity, and summary are still
      // saved so the frontend can display the report.
      const saveAiResult = await settingsService.getBoolean('saveAiResult', true)

      await reportService.saveAnalysisResult(reportId, {
        ...aiOutput,
        aiResultJson: saveAiResult ? aiOutput.aiResultJson : null,
      })

      // Mark completed
      await reportService.updateStage(reportId, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        completedAt: new Date(),
      })

      await logService.write('info', 'pipeline', 'Analysis completed', {
        reportId,
        sparkCode,
        severity: aiOutput.severity,
        isFallback: aiOutput.isFallback,
      })
    } catch (err) {
      const errorCode = this.classifyError(err)
      const errorMessage = err instanceof Error ? err.message : '分析过程发生未知错误'
      const errorDetail = {
        name: err instanceof Error ? err.name : 'UnknownError',
        message: errorMessage,
        module: 'analysis-pipeline',
        reportId,
        sparkCode,
      }

      await reportService.markFailed(reportId, errorCode, errorMessage, errorDetail)

      await logService.write('error', 'pipeline', `Analysis failed: ${errorCode}`, errorDetail)
    }
  }

  private classifyError(err: unknown): string {
    if (err instanceof AppError) {
      return err.code
    }
    if (err instanceof Error) {
      const msg = err.message.toLowerCase()
      if (msg.includes('timeout') || msg.includes('abort')) return 'SPARK_FETCH_TIMEOUT'
      if (msg.includes('404') || msg.includes('not found')) return 'SPARK_REPORT_NOT_FOUND'
      if (msg.includes('too large') || msg.includes('size')) return 'SPARK_RESPONSE_TOO_LARGE'
    }
    return 'INTERNAL_ERROR'
  }
}

export const analysisPipeline = new AnalysisPipeline()
