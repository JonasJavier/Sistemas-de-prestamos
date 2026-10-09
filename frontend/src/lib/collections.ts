import { useQueryClient } from '@tanstack/react-query'

/** Queries that show collection activity: refreshed after every action. */
export const COLLECTION_QUERIES = [
  ['my-route'],
  ['agenda'],
  ['delinquency'],
  ['loan-timeline'],
  ['customer-timeline'],
  ['me'],
]

export function useRefreshCollections() {
  const queryClient = useQueryClient()
  return () => {
    for (const key of COLLECTION_QUERIES) void queryClient.invalidateQueries({ queryKey: key })
  }
}
