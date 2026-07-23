import { z } from "zod";

export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export function paginationMeta({
  page,
  pageSize,
  count,
}: {
  page: number;
  pageSize: number;
  count: number;
}) {
  return {
    page,
    pageSize,
    total: count,
    hasNextPage: page * pageSize < count,
  };
}
