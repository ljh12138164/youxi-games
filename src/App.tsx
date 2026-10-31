type GameManifest = { title: string; description: string };

const manifests = import.meta.glob<GameManifest>('/games/*/game.json', {
  eager: true,
  import: 'default',
});

const games = Object.entries(manifests)
  .map(([path, manifest]) => ({ ...manifest, slug: path.split('/')[2]! }))
  .sort((a, b) => a.slug.localeCompare(b.slug));

export function App() {
  return (
    <main className="catalog">
      <h1>本地开发入口</h1>
      <p>多游戏项目架构。各入口独立运行、独立迭代。</p>
      <ul>
        {games.map((game) => (
          <li key={game.slug}>
            <a href={`./games/${game.slug}/`}>{game.title}</a>
            <p>{game.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
