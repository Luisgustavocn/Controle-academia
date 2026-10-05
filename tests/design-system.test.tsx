import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React, { useState } from "react";
import "./setup-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormField } from "../components/ui/form-field";
import { Dialog } from "../components/ui/dialog";
import { Drawer } from "../components/ui/drawer";
import { DropdownMenu, DropdownMenuItem } from "../components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { ToastProvider, useToast } from "../components/ui/toast";
import { Checkbox } from "../components/ui/checkbox";
import { Switch } from "../components/ui/switch";
import { Tooltip } from "../components/ui/tooltip";

afterEach(() => cleanup());

test("Button respects type, click, disabled and loading states", async () => {
  const user = userEvent.setup({ document });
  let clicks = 0;
  const { rerender } = render(<Button type="submit" onClick={() => clicks++}>Salvar</Button>);
  const button = screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement;
  assert.equal(button.type, "submit");
  await user.click(button);
  assert.equal(clicks, 1);

  rerender(<Button loading onClick={() => clicks++}>Salvar</Button>);
  assert.equal((screen.getByRole("button", { name: "Salvar" }) as HTMLButtonElement).disabled, true);
  assert.equal(screen.getByRole("button", { name: "Salvar" }).getAttribute("aria-busy"), "true");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
  assert.equal(clicks, 1);
});

test("Input and FormField associate labels, descriptions and errors", () => {
  render(
    <FormField label="E-mail" htmlFor="email" required>
      <Input id="email" description="Use o e-mail corporativo" error="E-mail inválido" />
    </FormField>
  );
  const input = screen.getByLabelText(/E-mail/) as HTMLInputElement;
  assert.equal(input.getAttribute("aria-invalid"), "true");
  const describedBy = input.getAttribute("aria-describedby") ?? "";
  assert.match(describedBy, /email-description/);
  assert.match(describedBy, /email-error/);
  assert.equal(screen.getByRole("alert").textContent, "E-mail inválido");
});

test("Dialog traps focus, closes with Escape and restores trigger focus", async () => {
  const user = userEvent.setup({ document });
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Abrir diálogo</button>
        <Dialog open={open} onOpenChange={setOpen} title="Editar aluno">
          <button type="button">Ação interna</button>
        </Dialog>
      </>
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Abrir diálogo" });
  await user.click(trigger);
  assert.ok(screen.getByRole("dialog"));
  assert.equal(document.activeElement?.getAttribute("aria-label"), "Fechar diálogo");
  await user.keyboard("{Shift>}{Tab}{/Shift}");
  assert.equal(document.activeElement?.textContent, "Ação interna");
  await user.keyboard("{Escape}");
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, trigger);
});

test("Drawer closes with Escape and restores focus", async () => {
  const user = userEvent.setup({ document });
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>Abrir painel</button>
        <Drawer open={open} onOpenChange={setOpen} title="Filtros"><button type="button">Aplicar</button></Drawer>
      </>
    );
  }
  render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Abrir painel" });
  await user.click(trigger);
  assert.ok(screen.getByRole("dialog", { name: "Filtros" }));
  await user.keyboard("{Escape}");
  assert.equal(screen.queryByRole("dialog"), null);
  assert.equal(document.activeElement, trigger);
});

test("DropdownMenu supports arrows, selection and Escape", async () => {
  const user = userEvent.setup({ document });
  let selected = "";
  render(
    <DropdownMenu trigger="Ações" label="Ações do registro">
      <DropdownMenuItem onSelect={() => { selected = "editar"; }}>Editar</DropdownMenuItem>
      <DropdownMenuItem destructive onSelect={() => { selected = "excluir"; }}>Excluir</DropdownMenuItem>
    </DropdownMenu>
  );
  const trigger = screen.getByRole("button", { name: "Ações do registro" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const menu = screen.getByRole("menu");
  assert.equal(menu.parentElement, document.body);
  assert.ok(menu.className.includes("fixed"));
  assert.ok(menu.className.includes("z-40"));
  assert.equal(document.activeElement?.textContent, "Editar");
  await user.keyboard("{ArrowDown}{Enter}");
  assert.equal(selected, "excluir");
  assert.equal(screen.queryByRole("menu"), null);

  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await user.keyboard("{Escape}");
  assert.equal(document.activeElement, trigger);
});

test("Tabs change with keyboard arrows and expose tab semantics", async () => {
  const user = userEvent.setup({ document });
  render(
    <Tabs defaultValue="geral">
      <TabsList aria-label="Seções do aluno">
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
      </TabsList>
      <TabsContent value="geral">Resumo</TabsContent>
      <TabsContent value="financeiro">Cobranças</TabsContent>
    </Tabs>
  );
  const geral = screen.getByRole("tab", { name: "Geral" });
  geral.focus();
  await user.keyboard("{ArrowRight}");
  assert.equal(screen.getByRole("tab", { name: "Financeiro" }).getAttribute("aria-selected"), "true");
  assert.equal(screen.getByRole("tabpanel").textContent, "Cobranças");
});

test("ConfirmDialog exposes destructive confirmation and loading protection", async () => {
  const user = userEvent.setup({ document });
  let confirms = 0;
  const { rerender } = render(
    <ConfirmDialog open onOpenChange={() => undefined} title="Excluir?" description="Esta ação não pode ser desfeita." confirmVariant="danger" onConfirm={() => { confirms++; }} />
  );
  await user.click(screen.getByRole("button", { name: "Confirmar" }));
  assert.equal(confirms, 1);
  rerender(<ConfirmDialog open onOpenChange={() => undefined} title="Excluir?" description="Aguarde." loading onConfirm={() => { confirms++; }} />);
  assert.equal((screen.getByRole("button", { name: "Confirmar" }) as HTMLButtonElement).disabled, true);
});

test("Toast announces feedback and can be dismissed", async () => {
  const user = userEvent.setup({ document });
  function Trigger() {
    const { toast } = useToast();
    return <button type="button" onClick={() => toast({ title: "Salvo", tone: "success", duration: 60_000 })}>Notificar</button>;
  }
  render(<ToastProvider><Trigger /></ToastProvider>);
  await user.click(screen.getByRole("button", { name: "Notificar" }));
  assert.equal(screen.getByRole("status").textContent?.includes("Salvo"), true);
  await user.click(screen.getByRole("button", { name: "Fechar notificação" }));
  assert.equal(screen.queryByRole("status"), null);
});

test("Checkbox and Switch work with labels and keyboard", async () => {
  const user = userEvent.setup({ document });
  render(
    <>
      <Checkbox label="Selecionar aluno" />
      <Switch label="Ativar lembretes" />
    </>
  );
  const checkbox = screen.getByRole("checkbox", { name: "Selecionar aluno" }) as HTMLInputElement;
  const toggle = screen.getByRole("switch", { name: "Ativar lembretes" }) as HTMLInputElement;
  checkbox.focus();
  await user.keyboard(" ");
  assert.equal(checkbox.checked, true);
  toggle.focus();
  await user.keyboard(" ");
  assert.equal(toggle.checked, true);
});

test("Tooltip associates complementary text with its interactive child", () => {
  render(<Tooltip content="Informação complementar"><button type="button">Ajuda</button></Tooltip>);
  const trigger = screen.getByRole("button", { name: "Ajuda" });
  const tooltip = screen.getByRole("tooltip");
  assert.equal(trigger.getAttribute("aria-describedby"), tooltip.id);
});
