export const normalizeSearch = (value) => String(value || "").trim().toLowerCase();

export function getSearchRank(term, values = []) {
  const query = normalizeSearch(term);
  if (!query) return 0;

  let bestRank = Number.POSITIVE_INFINITY;
  values.forEach((value, index) => {
    const text = normalizeSearch(value);
    if (!text) return;
    let rank = Number.POSITIVE_INFINITY;
    if (text === query) rank = 0;
    else if (text.startsWith(query)) rank = 10 + index;
    else {
      const wordMatch = text.split(/\s+/).some((word) => word.startsWith(query));
      if (wordMatch) rank = 30 + index;
      else if (text.includes(query)) rank = 60 + index;
    }
    bestRank = Math.min(bestRank, rank);
  });

  return bestRank;
}

export function sortBySearchRelevance(rows, term, getValues) {
  const query = normalizeSearch(term);
  if (!query) return rows;
  return [...rows].sort((a, b) => {
    const rankDiff = getSearchRank(query, getValues(a)) - getSearchRank(query, getValues(b));
    if (rankDiff !== 0) return rankDiff;
    return normalizeSearch(getValues(a)[0]).localeCompare(normalizeSearch(getValues(b)[0]));
  });
}
