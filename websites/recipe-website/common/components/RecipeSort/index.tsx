"use client";

import { useMemo } from "react";
import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { MassagedRecipeEntry } from "../../controller/data/read";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@discontent/component-library/components/ui/select";

export type RecipeSort = "relevance" | "name" | "newest" | "oldest";

const columnHelper = createColumnHelper<MassagedRecipeEntry>();
const columns = [
  columnHelper.accessor("name", { id: "name", sortingFn: "text" }),
  columnHelper.accessor("date", { id: "date" }),
];

function sortingStateFor(sort: RecipeSort): SortingState {
  switch (sort) {
    case "name":
      return [{ id: "name", desc: false }];
    case "newest":
      return [{ id: "date", desc: true }];
    case "oldest":
      return [{ id: "date", desc: false }];
    default:
      return []; // relevance / insertion order — keep input order
  }
}

/**
 * Sorts recipe entries client-side via TanStack Table's sorted row model.
 * "relevance" keeps the input order (FlexSearch relevance, or bookmark order).
 */
export function useSortedRecipes(
  recipes: MassagedRecipeEntry[] | undefined,
  sort: RecipeSort,
): MassagedRecipeEntry[] | undefined {
  const data = useMemo(() => recipes ?? [], [recipes]);
  const sorting = useMemo(() => sortingStateFor(sort), [sort]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  return useMemo(() => {
    if (!recipes) return undefined;
    return rows.map((row) => row.original);
  }, [recipes, rows]);
}

const OPTIONS: { value: RecipeSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "name", label: "Name (A–Z)" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

/**
 * A small Sort dropdown. Pass includeRelevance=false for lists with no inherent
 * relevance ordering (e.g. bookmarks), where the first option becomes "Newest".
 */
export function RecipeSortControl({
  value,
  onChange,
  includeRelevance = true,
}: {
  value: RecipeSort;
  onChange: (value: RecipeSort) => void;
  includeRelevance?: boolean;
}) {
  const options = includeRelevance
    ? OPTIONS
    : OPTIONS.filter((o) => o.value !== "relevance");

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Sort</span>
      <Select value={value} onValueChange={(v) => onChange(v as RecipeSort)}>
        <SelectTrigger size="sm" aria-label="Sort recipes">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
