import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

export function CategorySelect({
  value,
  onChange,
  includeAll,
  placeholder = "Selecione uma categoria",
}: {
  value?: string;
  onChange: (value: string) => void;
  includeAll?: boolean;
  placeholder?: string;
}) {
  const { data } = trpc.market.categories.useQuery();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[260px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">Todas as categorias</SelectItem>}
        {(data ?? []).map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
