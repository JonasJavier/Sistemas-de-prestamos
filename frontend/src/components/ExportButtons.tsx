import { useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '../api/client'
import { type ExportJob, type Filters, requestExport } from '../api/reports'
import { errorMessage } from '../lib/format'
import { notify } from '../lib/toast'
import { Button } from './ui'

/** PDF and Excel of the report on screen, with the very same filters
 * (decision 087); the file is made in the background. */
export function ExportButtons({ report, filters }: { report: string; filters: Filters }) {
  const queryClient = useQueryClient()
  const start = useMutation({
    meta: { inlineError: true },
    mutationFn: (format: ExportJob['format']) => requestExport(report, format, filters),
    onSuccess: (job) => {
      notify(
        `${job.title} en ${job.format_label}: la encuentras en «Mis exportaciones».`,
        'success',
      )
      void queryClient.invalidateQueries({ queryKey: ['my-exports'] })
    },
    onError: (error) => {
      if (error instanceof ApiError) notify(errorMessage(error.data))
    },
  })
  return (
    <div className="flex gap-2">
      <Button variant="secondary" disabled={start.isPending} onClick={() => start.mutate('pdf')}>
        PDF
      </Button>
      <Button variant="secondary" disabled={start.isPending} onClick={() => start.mutate('xlsx')}>
        Excel
      </Button>
    </div>
  )
}
