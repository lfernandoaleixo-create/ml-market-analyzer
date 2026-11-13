import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User } from "lucide-react";

interface GuestNameDialogProps {
  open: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function GuestNameDialog({ open, onConfirm, onCancel }: GuestNameDialogProps) {
  const [name, setName] = useState("");
  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    setName("");
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader className="pr-6">
          <DialogTitle className="font-display flex items-center gap-2 break-words">
            <User className="w-4 h-4 text-primary shrink-0" />
            Como você se chama?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Informe seu nome ou apelido para identificar suas contribuições. Será salvo neste dispositivo.
        </p>
        <Input
          autoFocus
          placeholder="Ex: Maria, João, Equipe..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") onCancel();
          }}
          maxLength={100}
        />
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel} className="text-muted-foreground">
            Cancelar
          </Button>
          <Button disabled={!name.trim()} onClick={handleConfirm}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
