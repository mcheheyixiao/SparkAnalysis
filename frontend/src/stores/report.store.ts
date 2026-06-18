import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useReportStore = defineStore('report', () => {
  const lastSubmittedUrl = ref('')
  const lastReportId = ref('')

  function setLastSubmission(url: string, reportId: string) {
    lastSubmittedUrl.value = url
    lastReportId.value = reportId
  }

  return { lastSubmittedUrl, lastReportId, setLastSubmission }
})
