import { useCallback, useState } from 'react'

import { isReauthRequired, reauthMethods } from '../../api/auth'
import { ConfirmIdentityDialog } from './ConfirmIdentityDialog'

/** The person closed the password prompt: the step simply does not happen. */
export class IdentityNotConfirmed extends Error {}

interface Asking {
  methods: { password: boolean; code: boolean }
  resolve: (confirmed: boolean) => void
}

/**
 * Runs a sensitive step (activating 2FA, recovery codes). When the sign-in is
 * older than 5 minutes allauth asks for it again: a dialog asks for the
 * password (or, for whoever joined with Google, the app's code) and the step
 * runs once more, without leaving the screen.
 */
export function useConfirmIdentity() {
  const [asking, setAsking] = useState<Asking | null>(null)
  const run = useCallback(async <T,>(step: () => Promise<T>): Promise<T> => {
    try {
      return await step()
    } catch (error) {
      if (!isReauthRequired(error)) throw error
      const methods = reauthMethods(error)
      const confirmed = await new Promise<boolean>((resolve) => setAsking({ methods, resolve }))
      setAsking(null)
      if (!confirmed) throw new IdentityNotConfirmed()
      return step()
    }
  }, [])
  const dialog = asking ? (
    <ConfirmIdentityDialog methods={asking.methods} onDone={asking.resolve} />
  ) : null
  return { run, dialog }
}
