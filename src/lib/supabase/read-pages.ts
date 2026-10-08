/** Read every page explicitly: PostgREST may cap any one response at 1,000 rows. */
export async function readPages<T>(
  page: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = 100_000
): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (rows.length > maxRows)
      throw new Error(
        'This selection is too large. Use a smaller audience or date range.'
      );
    if (batch.length < size) return rows;
  }
}
export async function readBatches<T>(
  ids: string[],
  read: (batch: string[]) => Promise<T[]>
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += 200)
    rows.push(...(await read(ids.slice(i, i + 200))));
  return rows;
}
