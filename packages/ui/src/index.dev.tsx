import { StrictMode } from 'react';

import { createRoot } from 'react-dom/client';

import './index.css';

type PlaygroundModule = {
  default: React.ComponentType;
  description?: string;
  title?: string;
};

const playgroundModules = import.meta.glob<PlaygroundModule>(
  './dev/**/*.dev.tsx',
  {
    eager: true,
  }
);

const playgrounds = Object.entries(playgroundModules)
  .map(([path, module]) => {
    const slug =
      path
        .split('/')
        .at(-1)
        ?.replace(/\.dev\.tsx$/, '') ?? path;
    return {
      Component: module.default,
      description: module.description,
      id: slug,
      title: module.title ?? slug,
    };
  })
  .sort((left, right) => left.title.localeCompare(right.title));

function App() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="space-y-3">
          <p className="text-sm font-semibold tracking-[0.3em] text-sky-300 uppercase">
            UI Playground
          </p>
          <div className="space-y-2">
            <h1 className="font-heading text-4xl font-semibold tracking-tight">
              Component playground
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-300">
              Each `*.dev.tsx` file is automatically loaded here so package
              development stays close to the exported library surface.
            </p>
          </div>
        </header>

        <section className="grid gap-6">
          {playgrounds.map(({ Component, description, id, title }) => (
            <article
              key={id}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-2xl shadow-slate-950/30 backdrop-blur"
            >
              <div className="border-b border-white/10 px-6 py-4">
                <h2 className="font-heading text-xl font-medium text-white">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 text-sm text-slate-300">{description}</p>
                ) : null}
              </div>
              <div className="bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.12),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.7),rgba(15,23,42,0.95))] px-6 py-8">
                <Component />
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
