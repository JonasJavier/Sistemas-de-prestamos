import { useQuery } from '@tanstack/react-query'

import { getProviders } from '../api/auth'

/** Decision 118: Google shows only once the owner set up its sign-in. */
export function useGoogleEnabled(): boolean {
  const providers = useQuery({
    queryKey: ['auth-providers'],
    queryFn: getProviders,
    staleTime: Infinity,
  })
  return providers.data?.some((provider) => provider.id === 'google') ?? false
}
