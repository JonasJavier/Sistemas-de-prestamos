import { useCallback, useState } from 'react'

import { isReauthRequired } from '../../api/auth'
import { ConfirmIdentityDialog } from './ConfirmIdentityDialog'

/** The person closed the password prompt: the step simply does not happen. */
export class IdentityNotConfirmed extends Error {}

/**
 * Runs a sensitive step (activating 2FA, recovery codes). When the sign-in is
 * older than 5 minutes allauth asks for it again: a dialog asks for the
 * password and the step runs once more, without leaving the screen.
 */
export function useConfirmIdentity() {
  const [asking, setAsking] = useState<((confirmed: boolean) => void) | null>(null)
  const run = useCallback(async <T,>(step: () => Promise<T>): Promise<T> => {
    try {
      return await step()
    } catch (error) {
      if (!isReauthRequired(error)) throw error
      const confirmed = await new Promise<boolean>((resolve) => setAsking(() => resolve))
      setAsking(null)
      if (!confirmed) throw new IdentityNotConfirmed()
      return step()
    }
  }, [])
  const dialog = asking ? <ConfirmIdentityDialog onDone={asking} /> : null
  return { run, dialog }
}
