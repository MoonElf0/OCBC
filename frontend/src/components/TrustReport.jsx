import { useState } from 'react'
import { useStore } from '../state/store'

/**
 * Download the Trust Map as a PDF file. The PDF library is loaded on first use,
 * so it never weighs on the app's first load.
 * @returns {[boolean, (trace: object) => Promise<void>]} busy, download
 */
export function useTrustReport() {
  const { dispatch } = useStore()
  const [busy, setBusy] = useState(false)
  const download = async (trace) => {
    setBusy(true)
    try {
      const { downloadTrustReport } = await import('./TrustReportPdf')
      await downloadTrustReport(trace)
    } catch (e) {
      console.error(e)
      dispatch({ type: 'toast', toast: { text: 'Could not create the PDF. Try again.' } })
    } finally {
      setBusy(false)
    }
  }
  return [busy, download]
}
