export function ModuleHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-sm text-muted">{description}</p>
    </header>
  );
}
