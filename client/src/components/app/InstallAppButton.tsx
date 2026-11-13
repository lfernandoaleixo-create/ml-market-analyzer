import { useEffect, useState } from "react";
import { Check, Download, Smartphone, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MERCATO_APP_ICON } from "@/lib/mercatoPwa";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.("(display-mode: standalone)");
    const updateMode = () => setInstalled(!!media?.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); setGuideOpen(false); };
    updateMode();
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    media?.addEventListener?.("change", updateMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      media?.removeEventListener?.("change", updateMode);
    };
  }, []);

  async function install() {
    if (!prompt) { setGuideOpen(true); return; }
    setBusy(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
      // Acceptance alone is not proof of installation: the appinstalled event confirms it.
    } catch {
      setGuideOpen(true);
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  }

  if (installed) return <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary" aria-label="Mercato aberto ou instalado como app"><Check className="h-4 w-4" /><span className={compact ? "hidden sm:inline" : undefined}>App instalado</span></span>;

  return <>
    <Button type="button" variant="outline" onClick={install} disabled={busy}
      className="h-11 shrink-0 gap-2 rounded-xl bg-background px-3 text-xs sm:text-sm"
      aria-label="Instalar Mercato" title="Instalar Mercato no dispositivo">
      <Download className="h-4 w-4" />
      <span>{busy ? "Aguarde…" : compact ? "Instalar" : "Instalar app"}</span>
    </Button>
    <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <img src={MERCATO_APP_ICON} alt="Toujours" className="mb-2 h-16 w-16 self-center rounded-2xl sm:self-start" />
          <DialogTitle>Mercato no seu dispositivo</DialogTitle>
          <DialogDescription>Instale no domínio publicado do Mercato. O app abre em sua própria janela, com a imagem Toujours e as mesmas funcionalidades.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed">
          <section><h3 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4 shrink-0" />iPhone e iPad</h3><p className="mt-1 text-muted-foreground">Abra no Safari, toque em Compartilhar e em Adicionar à Tela de Início. Ative Abrir como App, quando essa opção aparecer, e toque em Adicionar.</p></section>
          <section><h3 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4 shrink-0" />Android</h3><p className="mt-1 text-muted-foreground">Abra no Chrome. No menu ⋮, escolha Instalar app ou Adicionar à tela inicial. Confirme a instalação. O nome da opção pode variar conforme o navegador.</p></section>
          <section><h3 className="flex items-center gap-2 font-semibold"><Monitor className="h-4 w-4 shrink-0" />Windows, Mac e computador</h3><p className="mt-1 text-muted-foreground">No Chrome ou Edge compatível, use o ícone de instalação na barra de endereço ou a opção Instalar no menu. No Safari do Mac com macOS Sonoma 14 ou posterior, use Arquivo → Adicionar ao Dock.</p></section>
          <p className="rounded-xl bg-secondary p-3 text-xs text-muted-foreground">A instalação depende do sistema e navegador. Não é necessário baixar pela App Store ou Play Store. Entre com seu acesso habitual; um app recém-instalado pode solicitar login novamente. Consultas e gravações conectadas exigem internet.</p>
        </div>
        <Button type="button" className="h-11" onClick={() => setGuideOpen(false)}>Entendi</Button>
      </DialogContent>
    </Dialog>
  </>;
}
