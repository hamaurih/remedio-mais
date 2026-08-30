import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchPublicBootstrap } from "@/lib/publicBootstrap";

export const publicBootstrapQueryOptions = queryOptions({
  queryKey: ["public-bootstrap", 1] as const,
  queryFn: fetchPublicBootstrap,
  staleTime: 60_000,
  gcTime: 30 * 60_000,
  retry: 1,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
});

export function usePublicBootstrap() {
  return useQuery(publicBootstrapQueryOptions);
}
