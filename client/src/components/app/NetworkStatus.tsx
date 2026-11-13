import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function NetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (online) return null;
  return <div role="status" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
    <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
    <p>Sem conexão de rede. Informações já na tela podem estar desatualizadas. Reconecte à internet para consultar e salvar; o Mercato não agenda gravações offline.</p>
  </div>;
}
