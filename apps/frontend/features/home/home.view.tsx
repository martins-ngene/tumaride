import type { HomeViewModel } from "./home.view-model";

export function HomeView({ heading, description }: HomeViewModel) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-display text-foreground">{heading}</h1>
      <p className="mt-3">{description}</p>
    </main>
  );
}
